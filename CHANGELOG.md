# Changelog

All notable changes to WoClaw will be documented in this file.

## [0.1.5] - 2026-03-31

### Added
- Channel Plugin architecture for OpenClaw integration
- ESM module support for modern Node.js
- npm package: `xingp14-woclaw`
- GitHub Actions publish workflow
- Hook lifecycle system for memory integration
- MCP bridge support
- Multi-framework support (OpenClaw, Claude Code, Gemini CLI, OpenCode)

### Changed
- Project renamed from ClawLink to WoClaw
- Hub now uses TypeScript throughout
- README updated with comprehensive documentation
- Plugin split into separate `plugin/` directory with its own package

### Fixed
- ESM/CJS module compatibility
- Docker build configuration
- WebSocket reconnection handling

### Deprecated
- CLAWLINK_* environment variables (replaced by CLAW_*)

## [0.1.0] - 2026-03-26

### Added
- Initial WoClaw Hub implementation
- WebSocket-based message relay
- Topic-based pub/sub system
- REST API for hub management
- Basic Docker support
- Token authentication
