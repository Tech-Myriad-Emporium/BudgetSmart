import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { api } from "./api";
import { DashboardScreen } from "./screens/DashboardScreen";
import { TransactionsScreen } from "./screens/TransactionsScreen";
import { theme } from "./theme";

const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bg,
    border: theme.colors.border,
    primary: theme.colors.accent,
    text: theme.colors.fg,
  },
};

const ICON: Record<string, string> = { Dashboard: "▦", Transactions: "⇄" };

export function App() {
  const [ready, setReady] = useState(false);

  // Scaffold convenience: sign into the demo account on first launch.
  useEffect(() => {
    api
      .login("demo@budgetsmart.app", "demo1234")
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: theme.colors.bg, borderBottomColor: theme.colors.border, borderBottomWidth: 1 },
            headerTitleStyle: { color: theme.colors.fg, fontWeight: "600" },
            tabBarStyle: { backgroundColor: theme.colors.bg, borderTopColor: theme.colors.border, height: 64, paddingBottom: 8 },
            tabBarActiveTintColor: theme.colors.accent,
            tabBarInactiveTintColor: theme.colors.fgMuted,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{ICON[route.name] ?? "•"}</Text>,
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Transactions" component={TransactionsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}
