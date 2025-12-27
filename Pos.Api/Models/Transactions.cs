namespace Pos.Api.Models;

public class Transaction
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public decimal TotalPrice { get; set; }

    public List<TransactionItem> Items { get; set; } = new();

    public string PaymentMethod { get; set; } = "Cash"; // Cash, QRIS, EWallet, BankTransfer
    public decimal PaidAmount { get; set; }            // uang diterima (cash) / dibayar (non-cash)
    public decimal ChangeAmount { get; set; }          // kembalian (cash), non-cash = 0
    public string? PaymentRef { get; set; }            // optional: no referensi/txid (dummy)

    public string? CreatedByRole { get; set; }  // "Admin" / "Cashier"
    public string? CreatedByUser { get; set; }  // misal "Jaya" (optional)

}
