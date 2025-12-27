using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Pos.Api.Data;
using Pos.Api.Models;
using Pos.Api.Dtos;
using System.Security.Claims;

namespace Pos.Api.Controllers;


[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProductsController(AppDbContext db)
    {
        _db = db;
    }

    [Authorize(Policy = "CashierOrAdmin")]
    // GET: api/products?activeOnly=true
    [HttpGet]
    public async Task<IActionResult> GetAll(
    [FromQuery] string? search = null,
    [FromQuery] bool activeOnly = false,
    [FromQuery] bool lowStockOnly = false,
    [FromQuery] int? minStock = null,
    [FromQuery] string? category = null,
    [FromQuery] string? sortBy = "id",
    [FromQuery] string? order = "asc",
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 10,
    [FromQuery] string status = "all"

)
    {
        var q = _db.Products.AsNoTracking().AsQueryable();
        status = status.ToLowerInvariant();

        if (status == "active")
            q = q.Where(p => p.IsActive);
        else if (status == "inactive")
            q = q.Where(p => !p.IsActive);


        // search by name (case-insensitive, PostgreSQL)
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(p => EF.Functions.ILike(p.Name, $"%{s}%"));
        }

        if (activeOnly)
            q = q.Where(p => p.IsActive);

        if (lowStockOnly)
        {
            var threshold = minStock ?? 5;
            q = q.Where(p => p.Stock < threshold);
        }

        var desc = string.Equals(order, "desc", StringComparison.OrdinalIgnoreCase);

        q = (sortBy ?? "id").ToLowerInvariant() switch
        {
            "name" => desc ? q.OrderByDescending(p => p.Name) : q.OrderBy(p => p.Name),
            "price" => desc ? q.OrderByDescending(p => p.Price) : q.OrderBy(p => p.Price),
            "stock" => desc ? q.OrderByDescending(p => p.Stock) : q.OrderBy(p => p.Stock),
            _ => desc ? q.OrderByDescending(p => p.Id) : q.OrderBy(p => p.Id),
        };

        if (!string.IsNullOrWhiteSpace(category))
        {
            var cat = category.Trim();

            if (cat.Equals("Uncategorized", StringComparison.OrdinalIgnoreCase))
            {
                q = q.Where(p => p.Category == null || p.Category.Trim() == "" || p.Category == "Uncategorized");
            }
            else
            {
                q = q.Where(p => (p.Category ?? "").Trim() == cat);
            }
        }

        // ===== PAGINATION =====
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 10 : pageSize;
        pageSize = pageSize > 50 ? 50 : pageSize;

        var total = await q.CountAsync();

        var items = await q
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            page,
            pageSize,
            total,
            totalPages = (int)Math.Ceiling(total / (double)pageSize),
            items
        });
    }

    [Authorize(Policy = "AdminOnly")]
    // POST: api/products
    [HttpPost]
    public async Task<IActionResult> Create(Product input)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            return BadRequest("Name is required");

        if (input.Price < 0)
            return BadRequest("Price must be >= 0");

        if (input.Stock < 0)
            return BadRequest("Stock must be >= 0");

        // ✅ normalize category
        input.Category = string.IsNullOrWhiteSpace(input.Category)
            ? "Uncategorized"
            : input.Category.Trim();

        _db.Products.Add(input);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { id = input.Id }, input);
    }

    [Authorize(Policy = "AdminOnly")]
    // DELETE: api/products/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return NotFound();

        // ✅ Cek apakah produk sudah pernah dipakai di transaksi
        var usedInTransactions = await _db.TransactionItems
            .AsNoTracking()
            .AnyAsync(i => i.ProductId == id);

        if (usedInTransactions)
        {
            return Conflict("Product sudah pernah dipakai di transaksi, jadi tidak bisa dihapus. (Bisa nonaktifkan / set stok 0)");
        }

        _db.Products.Remove(product);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    
    [HttpGet("categories")]
    public async Task<IActionResult> Categories()
    {
        // ambil unik, rapihin, buang null/empty
        var cats = await _db.Products
            .AsNoTracking()
            .Select(p => (p.Category ?? "").Trim())
            .Where(c => c != "")
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        // pastikan "Uncategorized" ada kalau ada yang kosong/atau kamu mau selalu ada
        if (!cats.Contains("Uncategorized"))
            cats.Insert(0, "Uncategorized");

        return Ok(cats);
    }


    [Authorize(Policy = "AdminOnly")]
    // PATCH: api/products/{id}/active
    [HttpPatch("{id:int}/active")]
    public async Task<IActionResult> SetActive(int id, [FromBody] bool isActive)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return NotFound();

        product.IsActive = isActive;
        await _db.SaveChangesAsync();

        return Ok(new { product.Id, product.IsActive });
    }

    [Authorize(Policy = "AdminOnly")]
    // PUT: api/products/{id}
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateProductRequest dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Product name is required.");

        if (dto.Price < 0)
            return BadRequest("Price must be greater than or equal to 0.");

        if (dto.Stock < 0)
            return BadRequest("Stock must be greater than or equal to 0.");

        var product = await _db.Products.FindAsync(id);
        if (product is null)
            return NotFound("Product not found.");

        product.Name = dto.Name.Trim();
        product.Price = dto.Price;
        product.Stock = dto.Stock;

        if (dto.Category is not null)
        {
            product.Category = string.IsNullOrWhiteSpace(dto.Category)
                ? "Uncategorized"
                : dto.Category.Trim();
        }

        await _db.SaveChangesAsync();

        return Ok(product);
    }


}
