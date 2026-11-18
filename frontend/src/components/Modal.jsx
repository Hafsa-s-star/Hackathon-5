import { X } from "lucide-react";

export default function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal">
        <div className="modal-heading">
          <div><p className="eyebrow">WORKSPACE</p><h2>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
