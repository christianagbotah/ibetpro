import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPrediction, type RichPrediction } from "@/lib/api";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function MatchAnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [prediction, setPrediction] = useState<RichPrediction | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getPrediction(id)
      .then(setPrediction)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load prediction"));
  }, [id]);

  if (!prediction && !error) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Building match analysis…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <Text style={styles.error}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!prediction) return null;

  const featuredMarkets = prediction.markets.filter((market) =>
    [
      "over-1.5",
      "over-2.5",
      "under-2.5",
      "over-3.5",
      "btts-yes",
      "1x",
      "x2",
      "home-over-0.5",
      "away-over-0.5",
    ].includes(market.key)
  );

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.kicker}>AI MATCH FORECAST</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>HOME</Text>
              <Text style={styles.resultValue}>{pct(prediction.result.homeWin)}</Text>
            </View>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>DRAW</Text>
              <Text style={styles.resultValue}>{pct(prediction.result.draw)}</Text>
            </View>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>AWAY</Text>
              <Text style={styles.resultValue}>{pct(prediction.result.awayWin)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expected goals</Text>
          <View style={styles.xgRow}>
            <Text style={styles.xgValue}>{prediction.expectedGoals.home.toFixed(2)}</Text>
            <View style={styles.xgCenter}>
              <Text style={styles.mutedSmall}>TOTAL</Text>
              <Text style={styles.total}>{prediction.expectedGoals.total.toFixed(2)}</Text>
            </View>
            <Text style={styles.xgValue}>{prediction.expectedGoals.away.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Most likely scores</Text>
          <View style={styles.scoreGrid}>
            {prediction.scorelines.slice(0, 6).map((score) => (
              <View key={`${score.home}-${score.away}`} style={styles.scoreCard}>
                <Text style={styles.scoreLine}>{score.home} - {score.away}</Text>
                <Text style={styles.mutedSmall}>{pct(score.probability)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Markets</Text>
          <View style={styles.marketList}>
            {featuredMarkets.map((market) => (
              <View key={market.key} style={styles.marketRow}>
                <Text style={styles.marketLabel}>{market.label}</Text>
                <View style={styles.marketRight}>
                  <Text style={styles.marketProbability}>{pct(market.probability)}</Text>
                  {market.fairOdds ? (
                    <Text style={styles.mutedSmall}>fair {market.fairOdds.toFixed(2)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.qualityRow}>
          <View style={styles.qualityCard}>
            <Text style={styles.mutedSmall}>MODEL CONFIDENCE</Text>
            <Text style={styles.qualityValue}>{pct(prediction.confidence)}</Text>
          </View>
          <View style={styles.qualityCard}>
            <Text style={styles.mutedSmall}>DATA COMPLETE</Text>
            <Text style={styles.qualityValue}>{pct(prediction.dataCompleteness)}</Text>
          </View>
        </View>

        {prediction.warnings.length > 0 ? (
          <View style={styles.warning}>
            {prediction.warnings.map((item) => (
              <Text key={item} style={styles.warningText}>{item}</Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.model}>
          {prediction.modelVersion} · {prediction.source}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0f14" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, backgroundColor: "#0b0f14" },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  headerCard: { backgroundColor: "#121922", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#202b38" },
  kicker: { color: "#7e90a4", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  resultRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  resultBox: { flex: 1, backgroundColor: "#0b0f14", borderRadius: 12, alignItems: "center", paddingVertical: 13 },
  resultLabel: { color: "#68798c", fontSize: 10, fontWeight: "700" },
  resultValue: { color: "#f7fafc", fontSize: 22, fontWeight: "800", marginTop: 3 },
  section: { backgroundColor: "#121922", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#202b38" },
  sectionTitle: { color: "#f7fafc", fontSize: 15, fontWeight: "800", marginBottom: 12 },
  xgRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  xgValue: { color: "#f7fafc", fontSize: 34, fontWeight: "800" },
  xgCenter: { alignItems: "center" },
  total: { color: "#9de2b1", fontSize: 18, fontWeight: "800" },
  scoreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scoreCard: { width: "31%", backgroundColor: "#0b0f14", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  scoreLine: { color: "#f7fafc", fontSize: 16, fontWeight: "800" },
  marketList: { gap: 8 },
  marketRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#202b38" },
  marketLabel: { color: "#e6edf3", fontSize: 13, flex: 1 },
  marketRight: { alignItems: "flex-end" },
  marketProbability: { color: "#f7fafc", fontWeight: "800" },
  qualityRow: { flexDirection: "row", gap: 10 },
  qualityCard: { flex: 1, backgroundColor: "#121922", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#202b38" },
  qualityValue: { color: "#9de2b1", fontSize: 20, fontWeight: "800", marginTop: 4 },
  muted: { color: "#8fa1b5" },
  mutedSmall: { color: "#77889b", fontSize: 10, fontWeight: "700" },
  error: { color: "#ff7b86", padding: 20, textAlign: "center" },
  warning: { borderRadius: 14, backgroundColor: "#2b2110", padding: 12, gap: 5 },
  warningText: { color: "#f1b85b", fontSize: 12, lineHeight: 17 },
  model: { color: "#637386", fontSize: 10, textAlign: "center" },
});
