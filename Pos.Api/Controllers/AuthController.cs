using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Pos.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _config;

    // Dummy users (biar cepat). Nanti bisa pindah DB + hashing.
    private static readonly List<(string Username, string Password, string Role)> Users = new()
    {
        ("admin", "password", "Admin"),
        ("cashier", "password", "Cashier"),
    };

    public AuthController(IConfiguration config)
    {
        _config = config;
    }

    public record LoginRequest(string Username, string Password);

    [HttpPost("login")]
    public IActionResult Login(LoginRequest req)
    {
        var u = Users.FirstOrDefault(x =>
            x.Username.Equals(req.Username, StringComparison.OrdinalIgnoreCase) &&
            x.Password == req.Password);

        if (u == default)
            return Unauthorized("Invalid username or password.");

        var jwt = _config.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.Name, u.Username),
            new Claim(ClaimTypes.Role, u.Role),
        };

        var expiresMinutes = int.TryParse(jwt["ExpiresMinutes"], out var m) ? m : 120;

        var token = new JwtSecurityToken(
            issuer: jwt["Issuer"],
            audience: jwt["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: creds
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        return Ok(new
        {
            accessToken = tokenString,
            username = u.Username,
            role = u.Role
        });
    }
}
