# POS API - ASP.NET Core

Simple Point of Sale (POS) system built with ASP.NET Core Web API and PostgreSQL.

## Features
- JWT Authentication
- Product management (CRUD, categories, stock)
- Transactions & cart system
- Daily report
- Transaction history with pagination
- Simple HTML + JavaScript frontend

## Tech Stack
- ASP.NET Core Web API
- Entity Framework Core
- PostgreSQL
- JWT Authentication
- Bootstrap

## How to Run
```bash
dotnet restore
dotnet run

## How to Run (Docker)

docker compose up --build

API: http://localhost:8080
Swagger: http://localhost:8080/swagger
