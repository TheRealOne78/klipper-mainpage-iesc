# Makefile for Klipper Guest Print Portal

.PHONY: all help install build build-frontend build-backend dev dev-frontend dev-backend format lint test clean

# Default target
all: help

help:
	@echo "Disponibile target-uri in Makefile:"
	@echo "  make install        - Instaleaza dependintele pentru frontend si backend"
	@echo "  make build          - Build la tot proiectul (frontend si backend)"
	@echo "  make build-frontend - Build doar la frontend SPA"
	@echo "  make build-backend  - Build doar la backend-ul in Rust"
	@echo "  make dev            - Ruleaza concurent serverele de dezvoltare (frontend & backend)"
	@echo "  make format         - Formateaza codul (Rust si Frontend)"
	@echo "  make lint           - Ruleaza diagnosticare/analiza (Clippy si Oxlint)"
	@echo "  make test           - Ruleaza unit testele in Rust"
	@echo "  make clean          - Curata fisierele build-uite"

install:
	@echo "=== Instalez dependinte frontend ==="
	cd frontend && npm install
	@echo "=== Rezolv dependinte backend ==="
	cd backend && cargo fetch

build-frontend:
	@echo "=== Construiesc frontend SPA ==="
	cd frontend && npm run build

build-backend:
	@echo "=== Construiesc backend Rust ==="
	cd backend && cargo build --release

build: build-frontend build-backend

dev:
	@echo "=== Pornesc modul dev concurent (Frontend si Backend) ==="
	@make -j2 dev-frontend dev-backend

dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && cargo run

format:
	@echo "=== Formatez backend Rust ==="
	cd backend && cargo fmt
	@echo "=== Formatez frontend cu Prettier ==="
	cd frontend && npx prettier --write "src/**/*.{ts,tsx,scss,html}" --no-error-on-unmatched-pattern || true

lint:
	@echo "=== Analizez backend cu Clippy ==="
	cd backend && cargo clippy -- -D warnings
	@echo "=== Analizez frontend cu Oxlint ==="
	cd frontend && npm run lint

test:
	@echo "=== Rulez teste backend ==="
	cd backend && cargo test

clean:
	@echo "=== Curatare build frontend ==="
	rm -rf frontend/dist
	@echo "=== Curatare build backend ==="
	cd backend && cargo clean
