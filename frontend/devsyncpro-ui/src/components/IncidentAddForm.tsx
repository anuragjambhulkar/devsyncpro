import React, { useState } from "react";

export const IncidentAddForm: React.FC<{ onAdd?: () => void }> = ({ onAdd }) => {
  const [form, setForm] = useState<{ type: string; service: string; message: string }>({
    type: "",
    service: "",
    message: ""
  });
  const [msg, setMsg] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.type || !form.service || !form.message) {
      setMsg("All fields required");
      return;
    }

    fetch("http://localhost:8081/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    })
      .then(async r => {
        if (r.ok) {
          setMsg("Incident submitted!");
          setForm({ type: "", service: "", message: "" });
          if (onAdd) onAdd();
        } else {
          setMsg("Error: " + (await r.text()));
        }
        setTimeout(() => setMsg(null), 2400);
      })
      .catch(err => {
        setMsg("Network error: " + (err?.message || err));
        setTimeout(() => setMsg(null), 3000);
      });
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: "#23242b",
      color: "#fff",
      padding: 16,
      borderRadius: 8,
      marginBottom: 16,
      maxWidth: 440
    }}>
      <h4>Add Incident</h4>
      <input
        name="type"
        value={form.type}
        onChange={handleChange}
        placeholder="Incident Type"
        required
        autoComplete="off"
        style={{ marginBottom: 4, width: '100%' }}
      /><br />
      <input
        name="service"
        value={form.service}
        onChange={handleChange}
        placeholder="Service"
        required
        autoComplete="off"
        style={{ marginBottom: 4, width: '100%' }}
      /><br />
      <input
        name="message"
        value={form.message}
        onChange={handleChange}
        placeholder="Message"
        required
        autoComplete="off"
        style={{ marginBottom: 4, width: '100%' }}
      /><br />
      <button type="submit">Submit</button>
      {msg && <span style={{ marginLeft: 12 }}>{msg}</span>}
    </form>
  );
};
