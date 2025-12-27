namespace Pos.Api.Dtos;

public record UpdateProductRequest(
    string Name,
    decimal Price,
    int Stock,
    string? Category
);
