import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { formatMoney } from "../types";
import { theme } from "../theme";

export function DashboardScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard() });

  if (isLoading || !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg }}>
      <Card>
        <Text style={s.label}>SAFE TO SPEND</Text>
        <Text style={[s.stat, { color: theme.colors.accent }]}>{formatMoney(data.safeToSpend.amount)}</Text>
      </Card>

      <View style={{ flexDirection: "row", gap: theme.space.md }}>
        <Card style={{ flex: 1 }}>
          <Text style={s.label}>NET WORTH</Text>
          <Text style={s.stat}>{formatMoney(data.netWorth.total)}</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={s.label}>THIS MONTH</Text>
          <Text style={[s.stat, { color: data.cashflow.net >= 0 ? theme.colors.accent : theme.colors.error }]}>
            {formatMoney(data.cashflow.net)}
          </Text>
        </Card>
      </View>

      <Card>
        <Text style={s.label}>RECENT ACTIVITY</Text>
        <View style={{ marginTop: theme.space.sm }}>
          {data.recentTransactions.map((t) => {
            const sign = t.type === "income" ? "+" : t.type === "transfer" ? "" : "−";
            return (
              <View key={t.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.merchant} numberOfLines={1}>{t.merchant || "(no merchant)"}</Text>
                  <Text style={s.faint}>{t.date}</Text>
                </View>
                <Text style={[s.amount, t.type === "income" && { color: theme.colors.accent }]}>
                  {sign}
                  {formatMoney(t.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
  },
  label: { color: theme.colors.fgFaint, fontSize: 11, letterSpacing: 1, fontWeight: "600" },
  stat: { color: theme.colors.fg, fontSize: 30, fontWeight: "600", marginTop: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  merchant: { color: theme.colors.fg, fontSize: 14 },
  faint: { color: theme.colors.fgFaint, fontSize: 12, marginTop: 2 },
  amount: { color: theme.colors.fg, fontSize: 14, fontWeight: "600" },
});
