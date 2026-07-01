import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { formatMoney } from "../types";
import { theme } from "../theme";

export function TransactionsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["transactions"], queryFn: () => api.transactions() });

  if (isLoading || !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={{ padding: theme.space.lg }}
      data={data.transactions}
      keyExtractor={(t) => t.id}
      renderItem={({ item: t }) => {
        const sign = t.type === "income" ? "+" : t.type === "transfer" ? "" : "−";
        return (
          <View style={s.row}>
            <View style={s.icon}>
              <Text style={{ color: theme.colors.accent }}>{t.type === "transfer" ? "⇄" : "•"}</Text>
            </View>
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
      }}
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  merchant: { color: theme.colors.fg, fontSize: 14 },
  faint: { color: theme.colors.fgFaint, fontSize: 12, marginTop: 2 },
  amount: { color: theme.colors.fg, fontSize: 14, fontWeight: "600" },
});
