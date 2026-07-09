import { useEffect, useState, createContext, useContext } from "react";
import { Routes, Route } from "react-router-dom";
import { api, type User } from "./api";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import ShopPage from "./pages/ShopPage";
import AddShopPage from "./pages/AddShopPage";
import MePage from "./pages/MePage";

const UserContext = createContext<{ user: User; setUser: (u: User | null) => void } | null>(null);

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("UserContext missing");
  return ctx;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="loading">饭点加载中 …</div>;
  if (!user) return <AuthPage onLogin={setUser} />;

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/shop/:id" element={<ShopPage />} />
        <Route path="/shop/:id/edit" element={<AddShopPage />} />
        <Route path="/add" element={<AddShopPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </UserContext.Provider>
  );
}

// 10 分制展示，统一保留一位小数（如 8.5 分）
export function Score({ value }: { value: number }) {
  return (
    <span className="rating-num" aria-label={`${value.toFixed(1)} 分`}>
      {value.toFixed(1)}
      <span className="score-unit">分</span>
    </span>
  );
}

// 1.0-10.0 打分选择器：滑条粗调，± 按钮微调 0.1
export function ScorePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n * 10) / 10));
  const set = value > 0;
  return (
    <div className="score-picker">
      <div className="score-picker-row">
        <button type="button" onClick={() => onChange(clamp((set ? value : 8.1) - 0.1))} aria-label="减 0.1 分">
          −
        </button>
        <span className={`score-value ${set ? "" : "unset"}`}>{set ? value.toFixed(1) : "－.－"}</span>
        <button type="button" onClick={() => onChange(clamp((set ? value : 7.9) + 0.1))} aria-label="加 0.1 分">
          ＋
        </button>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={0.1}
        value={set ? value : 8}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        aria-label="打分，1 到 10 分，支持一位小数"
      />
    </div>
  );
}
