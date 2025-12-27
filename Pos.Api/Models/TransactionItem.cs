namespace Pos.Api.Models;

public class TransactionItem
{
    public int Id { get; set; }

    public int TransactionId { get; set; }
    public Transaction Transaction { get; set; } = default!;

    public int ProductId { get; set; }
    public decimal UnitPrice { get; set; }   // harga saat transaksi
    public int Quantity { get; set; }
}
