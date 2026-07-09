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
        <Route path="/add" element={<AddShopPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </UserContext.Provider>
  );
}

export function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="stars" aria-label={`${rating.toFixed(1)} 星`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? "" : "off"}>
          ★
        </span>
      ))}
    </span>
  );
}
