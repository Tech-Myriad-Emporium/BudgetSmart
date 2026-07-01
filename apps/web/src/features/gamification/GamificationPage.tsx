import type { Achievement, Challenge } from "@budgetsmart/shared";
import { Spinner } from "../../components/ui";
import { useGamification } from "../../lib/hooks";

export function GamificationPage() {
  const gQ = useGamification();
  const g = gQ.data;

  if (gQ.isLoading || !g) {
    return (
      <div className="page">
        <Spinner label="Tallying XP…" />
      </div>
    );
  }

  return (
    <div className="page">
      {/* hero: level + xp bar */}
      <div className="card" style={{ boxShadow: "var(--shadow-glow)", borderColor: "var(--border-accent)" }}>
        <div className="row between wrap" style={{ gap: 20 }}>
          <div className="row gap-lg" style={{ alignItems: "center" }}>
            <div className="level-badge">{g.level}</div>
            <div className="col" style={{ gap: 4 }}>
              <span className="card-title">Level {g.level}</span>
              <span className="stat stat-lg accent">{g.rank}</span>
              <span className="faint text-xs">{g.xp.toLocaleString()} XP total</span>
            </div>
          </div>
          <div className="row" style={{ gap: 28 }}>
            <Stat label="Streak" value={`${g.currentStreak}🔥`} sub={`best ${g.longestStreak}`} />
            <Stat label="SmartCoins" value={`${g.smartCoins}`} sub="◎ earned" tone="accent" />
            <Stat label="Badges" value={`${g.achievementsUnlocked}/${g.achievements.length}`} sub="unlocked" />
          </div>
        </div>

        <div className="col gap-sm" style={{ marginTop: 18 }}>
          <div className="row between text-xs">
            <span className="faint">Level {g.level}</span>
            <span className="num faint">
              {g.xpIntoLevel.toLocaleString()} / {g.xpForNextLevel.toLocaleString()} XP
            </span>
            <span className="faint">Level {g.level + 1}</span>
          </div>
          <div className="progress" style={{ height: 10 }}>
            <span style={{ width: `${Math.round(g.levelProgress * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* challenges */}
      <div className="card">
        <span className="card-title">Active challenges</span>
        <div className="grid grid-2" style={{ marginTop: 14 }}>
          {g.challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      </div>

      {/* achievements */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 14 }}>
          <span className="card-title">Achievements</span>
          <span className="faint text-xs">{g.achievementsUnlocked} of {g.achievements.length}</span>
        </div>
        <div className="achievement-grid">
          {g.achievements.map((a) => (
            <AchievementBadge key={a.id} achievement={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" }) {
  return (
    <div className="col">
      <span className="label">{label}</span>
      <span className={`stat stat-lg ${tone ?? ""}`}>{value}</span>
      {sub && <span className="faint text-xs">{sub}</span>}
    </div>
  );
}

function ChallengeCard({ challenge: c }: { challenge: Challenge }) {
  return (
    <div className="card" style={{ background: "#000", padding: 16 }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row gap-sm">
          <span style={{ fontSize: 18 }}>{c.icon}</span>
          <span className="text-sm">{c.name}</span>
        </div>
        <span className={`badge text-xs ${c.done ? "accent" : ""}`}>◎ {c.reward}</span>
      </div>
      <div className={`progress ${c.done ? "" : ""}`}>
        <span style={{ width: `${Math.round(c.progress * 100)}%` }} />
      </div>
      <div className="row between text-xs" style={{ marginTop: 6 }}>
        <span className="faint num">{c.current} / {c.target}</span>
        <span className={c.done ? "accent text-xs" : "faint text-xs"}>{c.done ? "Complete ✓" : `${Math.round(c.progress * 100)}%`}</span>
      </div>
    </div>
  );
}

function AchievementBadge({ achievement: a }: { achievement: Achievement }) {
  return (
    <div className={`achievement ${a.unlocked ? "unlocked" : "locked"}`} title={a.description}>
      <div className="achievement-icon">{a.unlocked ? a.icon : "🔒"}</div>
      <span className="text-xs" style={{ textAlign: "center", fontWeight: 500 }}>{a.name}</span>
      <span className="faint text-xs" style={{ textAlign: "center" }}>{a.unlocked ? `+${a.xp} XP` : a.description}</span>
    </div>
  );
}
