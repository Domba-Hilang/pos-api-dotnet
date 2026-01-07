# ===== build stage =====
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

COPY Pos.Api/Pos.Api.csproj ./Pos.Api/
RUN dotnet restore Pos.Api/Pos.Api.csproj

COPY . .
WORKDIR /app/Pos.Api
RUN dotnet publish -c Release -o /out

# ===== runtime stage =====
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Pos.Api.dll"]