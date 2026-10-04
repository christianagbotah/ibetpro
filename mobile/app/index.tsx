import { useCallback, useEffect, useState } from "react";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMatches, type MobileMatch } from "@/lib/api";

function probability(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function MatchCard({ match }: { match: MobileMatch }) {
  const live = match.status === "live";
  return (
    <Link href={{ pathname: "/match/[id]", params: { id: match.id } }} asChild>
      <Pressable style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.league}>{match.league}</Text>
          <Text style={[styles.status, live && styles.live]}>
            {live ? `LIVE ${match.minute ?? ""}'` : match.status.toUpperCase()}
          </Text>
        </View>

        <View style={styles.teams}>
          <View style={styles.teamColumn}>
            <Text style={styles.team}>{match.homeTeam}</Text>
            <Text style={styles.score}>{match.homeScore ?? "—"}</Text>
          </View>
          <Text style={styles.vs}>vs</Text>
          <View style={styles.teamColumn}>
            <Text style={styles.team}>{match.awayTeam}</Text>
            <Text style={styles.score}>{match.awayScore ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.probabilityRow}>
          <View style={styles.probabilityBox}>
            <Text style={styles.probabilityLabel}>HOME</Text>
            <Text style={styles.probabilityValue}>{probability(match.aiHomeWinProb)}</Text>
          </View>
          <View style={styles.probabilityBox}>
            <Text style={styles.probabilityLabel}>DRAW</Text>
            <Text style={styles.probabilityValue}>{probability(match.aiDrawProb)}</Text>
          </View>
          <View style={styles.probabilityBox}>
            <Text style={styles.probabilityLabel}>AWAY</Text>
            <Text style={styles.probabilityValue}>{probability(match.aiAwayWinProb)}</Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

export default function HomeScreen() {
  const [matches, setMatches] = useState<MobileMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await getMatches();
      setMatches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load matches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Loading live matches…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <View style={styles.hero}>
        <Text style={styles.title}>Football intelligence, live.</Text>
        <Text style={styles.subtitle}>
          Tap any fixture for probabilities, expected goals and market analysis.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MatchCard match={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={<Text style={styles.muted}>No matches available right now.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0f14" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#0b0f14" },
  hero: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  title: { color: "#f7fafc", fontSize: 26, lineHeight: 32, fontWeight: "800" },
  subtitle: { color: "#9aa6b2", marginTop: 6, lineHeight: 20 },
  list: { padding: 14, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: "#121922", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#202b38" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  league: { color: "#8fa1b5", fontSize: 12, flex: 1 },
  status: { color: "#8fa1b5", fontSize: 11, fontWeight: "700" },
  live: { color: "#ff5b67" },
  teams: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  teamColumn: { flex: 1, alignItems: "center", gap: 8 },
  team: { color: "#f7fafc", fontSize: 15, fontWeight: "700", textAlign: "center" },
  score: { color: "#f7fafc", fontSize: 30, fontWeight: "800" },
  vs: { color: "#667789", fontSize: 12 },
  probabilityRow: { flexDirection: "row", gap: 8 },
  probabilityBox: { flex: 1, backgroundColor: "#0b0f14", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  probabilityLabel: { color: "#68798c", fontSize: 10, fontWeight: "700" },
  probabilityValue: { color: "#f7fafc", marginTop: 2, fontSize: 16, fontWeight: "800" },
  muted: { color: "#8fa1b5", textAlign: "center" },
  error: { color: "#ff7b86", paddingHorizontal: 18, paddingVertical: 8 },
});
