namespace Pos.Api.Dtos;

public record CreateTransactionItem(int ProductId, int Quantity);

public record CreateTransactionRequest(
    List<CreateTransactionItem> Items,
    string? PaymentMethod,
    decimal? CashReceived,
    string? PaymentRef
);
