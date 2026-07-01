import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../lib/api";
import { ErrorText, Field } from "../../components/ui";

function Brand() {
  return (
    <div className="brand" style={{ justifyContent: "center", padding: "0 0 26px", fontSize: 20 }}>
      <span className="brand-mark" style={{ width: 28, height: 28, fontSize: 16 }}>
        $
      </span>
      <span>
        Budget<span className="brand-accent">Smart</span>
      </span>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@budgetsmart.app");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card col gap-lg" onSubmit={submit}>
        <Brand />
        <div className="col" style={{ gap: 4, marginBottom: 4 }}>
          <h2 style={{ fontSize: 18 }}>Welcome back</h2>
          <span className="faint text-sm">Sign in to your terminal.</span>
        </div>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <button className="btn btn-primary btn-block" disabled={busy} type="submit">
          {busy ? <span className="ring" /> : "Sign in →"}
        </button>

        <div className="row" style={{ justifyContent: "center" }}>
          <span className="faint text-sm">
            No account?{" "}
            <Link to="/register" className="accent">
              Create one
            </Link>
          </span>
        </div>
        <div className="chip" style={{ justifyContent: "center" }}>
          demo@budgetsmart.app · demo1234
        </div>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register({ name, email, password });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card col gap-lg" onSubmit={submit}>
        <Brand />
        <div className="col" style={{ gap: 4, marginBottom: 4 }}>
          <h2 style={{ fontSize: 18 }}>Create your account</h2>
          <span className="faint text-sm">Starts with a full set of categories, ready to budget.</span>
        </div>

        <Field label="Name" htmlFor="name">
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            autoComplete="new-password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <button className="btn btn-primary btn-block" disabled={busy} type="submit">
          {busy ? <span className="ring" /> : "Create account →"}
        </button>

        <div className="row" style={{ justifyContent: "center" }}>
          <span className="faint text-sm">
            Already have one?{" "}
            <Link to="/login" className="accent">
              Sign in
            </Link>
          </span>
        </div>
      </form>
    </div>
  );
}
