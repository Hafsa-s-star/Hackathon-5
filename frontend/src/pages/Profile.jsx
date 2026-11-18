import { useState } from "react";
import { Camera, Check, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import useAuth from "../context/useAuth";
import { uploadImage } from "../services/imagekit";

const roleNames = { admin: "Administrator", warehouseManager: "Warehouse manager", supplier: "Supplier", salesRepresentative: "Sales representative" };

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const image = file ? await uploadImage(file) : {};
      const { data } = await api.put("/users/me", { ...form, ...image });
      updateUser(data.user);
      setFile(null);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Profile could not be updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="topline"><span>STOCKWISE</span><span className="topline-divider" /><span>Account</span><span className="topline-divider" /><span>My profile</span></div>
      <header className="page-heading"><div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>My profile<span className="heading-period">.</span></h1><p className="page-subtitle">Keep your account details and profile image up to date.</p></div></header>
      <section className="panel profile-panel">
        <div className="profile-cover"><div className="profile-picture-wrap">
          {file ? <img src={URL.createObjectURL(file)} alt="Selected profile" /> : user?.image ? <img src={user.image} alt={user.name} /> : <div className="profile-picture-initials">{user?.name?.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase()}</div>}
          <label className="camera-button" title="Upload profile image"><Camera size={15} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
        </div></div>
        <form className="profile-form" onSubmit={submit}>
          <div className="profile-heading"><div><h2>{user?.name}</h2><span className="role-pill">{roleNames[user?.role]}</span></div><div className="verified-label"><ShieldCheck size={15} /> Secure account</div></div>
          <div className="form-grid">
            <label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
            <label>Email address<input disabled value={user?.email || ""} /></label>
            <label>Phone<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="Add a contact number" /></label>
            <label>Role<input disabled value={roleNames[user?.role] || ""} /></label>
          </div>
          {file && <div className="file-selected"><Check size={14} /> {file.name} <span>Ready to upload securely</span></div>}
          <div className="profile-form-footer"><span>ImageKit uploads are private-key signed on the server.</span><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
        </form>
      </section>
    </div>
  );
}
