import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function Unauthorized() {
  return <main className="unauthorized-page"><div className="unauthorized-card"><div className="unauthorized-icon"><ShieldAlert size={25} /></div><p className="eyebrow">ACCESS RESTRICTED</p><h1>This area is for another role.</h1><p>Your account doesn’t have permission to view this workspace section.</p><Link className="button button-primary" to="/"><ArrowLeft size={16} /> Back to dashboard</Link></div></main>;
}
