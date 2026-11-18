import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, Boxes, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import useAuth from "../context/useAuth";
import api from "../services/api";

export default function Login() {
  const { user, loading, login, register } = useAuth();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "salesRepresentative" });
  if (!loading && user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (signup) await register(form);
      else await login({ email: form.email, password: form.password });
    } catch (error) {
      const message = error.response?.data?.message ||
        (error.code === "ERR_NETWORK"
          ? `Stockwise API is not reachable at ${api.defaults.baseURL}. Start the backend with npm run dev.`
          : "Sign-in failed. Check your credentials and try again.");
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand"><div className="brand-mark"><ChartNoAxesCombined size={19} /></div><strong>stockwise</strong></div>
      <div className="auth-layout">
        <section className="auth-aside">
          <div className="auth-art"><div className="art-glow" /><div className="art-box art-box-one"><Boxes size={25} /></div><div className="art-box art-box-two"><ChartNoAxesCombined size={22} /></div><div className="art-ring" /></div>
          <div className="aside-copy"><p className="eyebrow">YOUR OPERATIONS, IN SYNC</p><h1>Clarity for every<br /><em>moving part.</em></h1><p>One calm place to manage stock, warehouses, orders and your supply network.</p><div className="aside-check"><ShieldCheck size={17} /> Secure access for your whole team</div></div>
          <span className="auth-footnote">STOCKWISE INVENTORY OS <span>•</span> BUILT FOR WHAT'S NEXT</span>
        </section>
        <section className="auth-form-wrap">
          <div className="auth-form">
            <p className="eyebrow">{signup ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</p>
            <h2>{signup ? "Get started" : "Sign in to your workspace"}</h2>
            <p className="auth-subtitle">{signup ? "Choose your role and create your Stockwise account." : "Enter your credentials to continue."}</p>
            <form onSubmit={submit}>
              {signup && <label>Full name<input required autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Alex Morgan" /></label>}
              {signup && <label>Account role
                <select required value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
                  <option value="salesRepresentative">Sales Representative</option>
                  <option value="supplier">Supplier</option>
                  <option value="warehouseManager">Warehouse Manager</option>
                </select>
              </label>}
              <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="you@company.com" /></label>
              {signup && <label>Phone <span className="optional">OPTIONAL</span><input autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="+1 (555) 000-0000" /></label>}
              <label>Password<input required minLength={8} type="password" autoComplete={signup ? "new-password" : "current-password"} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder={signup ? "At least 8 characters" : "Enter your password"} /></label>
              <button className="button button-primary auth-submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"} <ArrowRight size={17} /></button>
            </form>
            <p className="auth-toggle">{signup ? "Already have an account?" : "New to Stockwise?"} <button onClick={() => setSignup(!signup)}>{signup ? "Sign in" : "Create account"}</button></p>
            <p className="auth-security"><ShieldCheck size={15} /> Your data is protected with secure, encrypted sessions.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
