import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useUser } from "../App";

type Invite = { code: string; created_at: number; used_at: number | null; used_by_nickname: string | null };

export default function MePage() {
  const nav = useNavigate();
  const { user, setUser } = useUser();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.isAdmin) api.invites().then(setInvites).catch(() => {});
  }, [user.isAdmin]);

  async function createInvite() {
    setBusy(true);
    try {
      await api.createInvite();
      setInvites(await api.invites());
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    const text = `来「饭点」看看我们圈子私藏的好店：${location.origin}\n邀请码：${code}`;
    try {
      await navigator.clipboard.writeText(text);
      alert("已复制邀请信息，发给朋友吧");
    } catch {
      prompt("手动复制：", text);
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
  }

  return (
    <>
      <header className="topbar">
        <button className="back-btn" onClick={() => nav(-1)}>
          ‹ 返回
        </button>
        <h1>我的</h1>
      </header>

      <div className="page">
        <div className="me-head">
          <div className="avatar">{user.nickname.slice(0, 1)}</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{user.nickname}</div>
            <div className="hint">
              @{user.username}
              {user.isAdmin ? " · 管理员" : ""}
            </div>
          </div>
        </div>

        {user.isAdmin && (
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 4px" }}>
            邀请朋友
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            每个邀请码只能用一次。生成后连同网址一起发给朋友。
          </p>
          {invites.map((i) => (
            <div key={i.code} className="invite-item">
              <span className="code">{i.code}</span>
              {i.used_at ? (
                <span className="status">已被 {i.used_by_nickname ?? "?"} 使用</span>
              ) : (
                <>
                  <span className="status">未使用 · {fmtDate(i.created_at)}</span>
                  <button className="copy" onClick={() => copy(i.code)}>
                    复制
                  </button>
                </>
              )}
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <button className="btn secondary" onClick={createInvite} disabled={busy}>
              {busy ? "生成中 …" : "生成新邀请码"}
            </button>
          </div>
        </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button className="btn secondary" onClick={logout}>
            退出登录
          </button>
        </div>
      </div>
    </>
  );
}
