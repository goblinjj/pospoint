import { useEffect, useState, type FormEvent } from "react";
import { api, type User } from "../api";

export default function AuthPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [needsInvite, setNeedsInvite] = useState(true);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .authStatus()
      .then((s) => {
        setNeedsInvite(s.needsInvite);
        if (!s.needsInvite) setMode("register");
      })
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await api.login({ username, password })
          : await api.register({ username, nickname, password, invite });
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "出错了");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="stamp">小众点评</div>
        <p>私 家 觅 食 地 图</p>
      </div>

      {!needsInvite && mode === "register" && (
        <p className="hint" style={{ textAlign: "center", marginBottom: 16 }}>
          你是第一位用户，注册后即为管理员
        </p>
      )}

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={submit}>
        <div className="field">
          <label>用户名（登录用，中文、字母、数字均可）</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </div>
        {mode === "register" && (
          <div className="field">
            <label>昵称（朋友们看到的名字）</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        {mode === "register" && needsInvite && (
          <div className="field">
            <label>邀请码</label>
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value.toUpperCase())}
              placeholder="向圈内朋友要一个"
              required
            />
          </div>
        )}
        <button className="btn" disabled={busy}>
          {busy ? "请稍候 …" : mode === "login" ? "进入小众点评" : "注册并进入"}
        </button>
      </form>

      <div className="auth-toggle">
        {mode === "login" ? (
          <>
            还没有账号？
            <button onClick={() => setMode("register")}>凭邀请码注册</button>
          </>
        ) : (
          <>
            已经有账号？
            <button onClick={() => setMode("login")}>直接登录</button>
          </>
        )}
      </div>
    </div>
  );
}
