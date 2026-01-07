using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Pos.Api.Data;
using Pos.Api.Dtos;
using Pos.Api.Models;
using System.Security.Claims;

namespace Pos.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly AppDbContext _db;

    public TransactionsController(AppDbContext db) => _db = db;

    [Authorize(Policy = "CashierOrAdmin")]
    [HttpPost]
    public async Task<IActionResult> Create(CreateTransactionRequest request)
    {
        if (request.Items is null || request.Items.Count == 0)
            return BadRequest("Items cannot be empty.");

        // Ambil semua Product yang dibutuhkan dalam 1 query
        var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await _db.Products.Where(p => productIds.Contains(p.Id)).ToListAsync();

        if (products.Count != productIds.Count)
            return BadRequest("One or more ProductId not found.");

        // Validasi stok + hitung total
        decimal total = 0;

        foreach (var item in request.Items)
        {
            if (item.Quantity <= 0) return BadRequest("Quantity must be > 0.");

            var product = products.First(p => p.Id == item.ProductId);

            if (product.Stock < item.Quantity)
                return BadRequest($"Stock not enough for product '{product.Name}'. Current stock: {product.Stock}");

            total += product.Price * item.Quantity;
        }

        var method = (request.PaymentMethod ?? "Cash").Trim();

        decimal paidAmount;
        decimal changeAmount = 0;

        if (method.Equals("Cash", StringComparison.OrdinalIgnoreCase))
        {
            var cash = request.CashReceived ?? 0;
            if (cash < total)
                return BadRequest($"Cash is not enough. Total: {total}, received: {cash}");

            paidAmount = cash;
            changeAmount = cash - total;
        }
        else
        {
            // dummy non-cash
            paidAmount = total;
            changeAmount = 0;
        }

        // Buat transaksi
        var tx = new Transaction
        {
            TotalPrice = total,
            CreatedAt = DateTime.UtcNow,

            PaymentMethod = method,
            PaidAmount = paidAmount,
            ChangeAmount = changeAmount,
            PaymentRef = string.IsNullOrWhiteSpace(request.PaymentRef) ? null : request.PaymentRef.Trim(),

            CreatedByRole = User.FindFirstValue(ClaimTypes.Role) ?? "Unknown",
            CreatedByUser = User.FindFirstValue(ClaimTypes.Name) ?? "Unknown",

            Items = new List<TransactionItem>()
        };

        // Kurangi stok + simpan item (ambil UnitPrice saat ini)
        foreach (var item in request.Items)
        {
            var product = products.First(p => p.Id == item.ProductId);

            product.Stock -= item.Quantity;

            tx.Items.Add(new TransactionItem
            {
                ProductId = product.Id,
                UnitPrice = product.Price,
                Quantity = item.Quantity
            });
        }

        _db.Transactions.Add(tx);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            tx.Id,
            tx.CreatedAt,
            tx.TotalPrice,
            tx.PaymentMethod,
            tx.PaidAmount,
            tx.ChangeAmount,
            tx.PaymentRef,
            tx.CreatedByRole,
            tx.CreatedByUser,
            Items = tx.Items.Select(i => new { i.ProductId, i.UnitPrice, i.Quantity })
        });
    }

    [Authorize(Policy = "CashierOrAdmin")]
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var txs = await _db.Transactions
            .AsNoTracking()
            .Include(t => t.Items)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new
            {
                t.Id,
                CreatedAtWib = t.CreatedAt, // sudah WIB kalau kamu pakai konversi
                t.TotalPrice,
                Items = t.Items.Select(i => new
                {
                    i.ProductId,
                    i.UnitPrice,
                    i.Quantity
                })
            })
            .ToListAsync();

        return Ok(txs);
    }

    [Authorize(Policy = "CashierOrAdmin")]
    [HttpGet("reports/daily")]
    public async Task<IActionResult> DailyReport([FromQuery] DateOnly date)
    {
        // WIB time zone
        var wib = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); // Windows
        var startWib = date.ToDateTime(TimeOnly.MinValue); // Unspecified (anggap lokal WIB)
        var endWib = date.ToDateTime(TimeOnly.MaxValue);

        // convert to UTC boundaries
        var startUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(startWib, DateTimeKind.Unspecified), wib);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(endWib, DateTimeKind.Unspecified), wib);

        var report = await _db.Transactions
            .Where(t => t.CreatedAt >= startUtc && t.CreatedAt <= endUtc)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Date = date,
                TotalTransactions = g.Count(),
                TotalRevenue = g.Sum(x => x.TotalPrice)
            })
            .FirstOrDefaultAsync();

        return Ok(report ?? new
        {
            Date = date,
            TotalTransactions = 0,
            TotalRevenue = 0m
        });
    }

    [Authorize(Policy = "CashierOrAdmin")]
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var tx = await _db.Transactions
            .AsNoTracking()
            .Include(t => t.Items)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (tx is null) return NotFound("Transaction not found.");

        var productIds = tx.Items.Select(i => i.ProductId).Distinct().ToList();
        var nameMap = await _db.Products
            .AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name);

        return Ok(new
        {
            tx.Id,
            tx.CreatedAt,
            tx.TotalPrice,
            tx.PaymentMethod,
            tx.PaidAmount,
            tx.ChangeAmount,
            tx.PaymentRef,
            tx.CreatedByUser,
            tx.CreatedByRole,
            Items = tx.Items.Select(i => new
            {
                i.ProductId,
                ProductName = nameMap.TryGetValue(i.ProductId, out var n) ? n : $"#{i.ProductId}",
                i.UnitPrice,
                i.Quantity,
                Subtotal = i.UnitPrice * i.Quantity
            })
        });
    }

    [Authorize(Policy = "CashierOrAdmin")]
[HttpGet("history")]
public async Task<IActionResult> History(
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 10,
    [FromQuery] DateOnly? date = null)
{
    page = page < 1 ? 1 : page;
    pageSize = pageSize < 1 ? 10 : pageSize;
    pageSize = pageSize > 100 ? 100 : pageSize;

    var q = _db.Transactions.AsNoTracking();

    if (date.HasValue)
    {
        var wib = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");

        var startWib = date.Value.ToDateTime(TimeOnly.MinValue);
        var endWib = startWib.AddDays(1);

        var startUtc = TimeZoneInfo.ConvertTimeToUtc(startWib, wib);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(endWib, wib);

        q = q.Where(t => t.CreatedAt >= startUtc && t.CreatedAt < endUtc);
    }

    var total = await q.CountAsync();
    var totalPages = (int)Math.Ceiling(total / (double)pageSize);

    var items = await q
        .OrderByDescending(t => t.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(t => new
        {
            t.Id,
            t.CreatedAt,
            t.TotalPrice,
            t.PaymentMethod,
            t.ChangeAmount,
            t.CreatedByUser,
            t.CreatedByRole
        })
        .ToListAsync();

    return Ok(new { page, pageSize, total, totalPages, items });
}

}
