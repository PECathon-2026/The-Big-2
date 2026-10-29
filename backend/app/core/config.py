from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All settings come from environment variables prefixed TSUKUYOMI_ (or backend/.env)."""

    model_config = SettingsConfigDict(env_prefix="TSUKUYOMI_", env_file=".env", extra="ignore")

    astrometry_api_key: str = ""
    launch_library_key: str = ""
    demo_replay: bool = False  # legacy switch: True behaves like replay_mode="fallback"
    replay_mode: str = "off"  # off | fallback (replay only when the upstream fails) | first (serve recordings without calling out)
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    data_dir: str = "data"
    user_agent: str = "TsukuyomiWatch/0.1 (PECathon 2026 hackathon project)"
    http_timeout_s: float = 30.0

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def effective_replay_mode(self) -> str:
        m = (self.replay_mode or "off").lower()
        if m not in ("off", "fallback", "first"):
            m = "off"
        if m == "off" and self.demo_replay:
            m = "fallback"
        return m

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
