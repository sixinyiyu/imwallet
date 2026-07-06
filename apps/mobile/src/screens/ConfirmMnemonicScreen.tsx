import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { useAlert } from "../hooks/useAlert";
import { useSecureScreen, useScreenshotDetector } from "../hooks/useSecureScreen";
import { getErrorMessage } from "../utils/format";

type Nav = NativeStackNavigationProp<RootStackParamList, "ConfirmMnemonic">;
type RouteType = RouteProp<RootStackParamList, "ConfirmMnemonic">;

export default function ConfirmMnemonicScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const mnemonicStr = route.params?.mnemonic || "";
  const { backupWallet } = useWalletStore();

  // ─── Secure screen: prevent screenshot/recording ───
  useSecureScreen();
  useScreenshotDetector(() => {
    showToast("检测到截图！请勿截图保存助记词，以免资产泄露");
  });

  const correctWords = useMemo(() => mnemonicStr.split(/\s+/), [mnemonicStr]);

  // Shuffle the words for selection
  const shuffledWords = useMemo(() => {
    const arr = [...correctWords];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [correctWords]);

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [wrongFlags, setWrongFlags] = useState<Set<number>>(new Set());
  const [verifying, setVerifying] = useState(false);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // Build the selected words in order
  const selectedWords = selectedIndices.map((i) => shuffledWords[i]);

  // Check if all selected and in correct order
  const isAllSelected = selectedIndices.length === correctWords.length;
  const isCorrectOrder = isAllSelected && selectedWords.every((w, i) => w === correctWords[i]);
  const canProceed = isAllSelected && isCorrectOrder;

  const handleSelectWord = (index: number) => {
    if (selectedIndices.includes(index)) return; // already selected

    const newSelected = [...selectedIndices, index];
    setSelectedIndices(newSelected);

    // Check the newly added word against the expected position
    const position = newSelected.length - 1;
    if (shuffledWords[index] !== correctWords[position]) {
      // Wrong order - mark with red X
      const newWrong = new Set(wrongFlags);
      newWrong.add(position);
      setWrongFlags(newWrong);
      showToast("助记词顺序不正确");
    } else {
      // Correct - remove any wrong flag for this position
      const newWrong = new Set(wrongFlags);
      newWrong.delete(position);
      setWrongFlags(newWrong);
    }
  };

  const handleRemoveWord = (position: number) => {
    const newSelected = selectedIndices.filter((_, i) => i !== position);
    setSelectedIndices(newSelected);
    // Re-validate remaining words
    const newWrong = new Set<number>();
    newSelected.forEach((idx, pos) => {
      if (shuffledWords[idx] !== correctWords[pos]) {
        newWrong.add(pos);
      }
    });
    setWrongFlags(newWrong);
  };

  const handleNext = async () => {
    if (!canProceed || !walletId || verifying) return;
    setVerifying(true);
    showToast("助记词正确");
    try {
      await backupWallet(walletId);
      // Wait so user can see the toast before navigating
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Go back to wallet detail
      navigation.reset({
        index: 1,
        routes: [
          { name: "Main" },
          { name: "WalletDetail", params: { walletId } },
        ],
      });
    } catch (err: unknown) {
      setVerifying(false);
      alert("备份失败", getErrorMessage(err, "请稍后重试"));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>确认助记词</Text>
      <Text style={styles.subtitle}>请按顺序选择助记词</Text>

      {/* Selected words area */}
      <View style={styles.selectedArea}>
        {selectedWords.length === 0 && (
          <Text style={styles.emptyHint}>点击下方单词按顺序选择</Text>
        )}
        <View style={styles.selectedRow}>
          {selectedWords.map((word, position) => {
            const isWrong = wrongFlags.has(position);
            return (
              <TouchableOpacity
                key={`${position}-${word}`}
                style={[styles.selectedTag, isWrong && styles.selectedTagWrong]}
                onPress={() => handleRemoveWord(position)}
                activeOpacity={0.6}
              >
                <Text style={[styles.selectedTagText, isWrong && styles.selectedTagTextWrong]}>
                  {word}
                </Text>
                {isWrong && <Text style={styles.wrongX}>✕</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Available words */}
      <View style={styles.availableArea}>
        <View style={styles.availableRow}>
          {shuffledWords.map((word, index) => {
            const isSelected = selectedIndices.includes(index);
            return (
              <TouchableOpacity
                key={`${index}-${word}`}
                style={[styles.availableTag, isSelected && styles.availableTagSelected]}
                onPress={() => handleSelectWord(index)}
                disabled={isSelected}
                activeOpacity={0.6}
              >
                <Text style={[styles.availableTagText, isSelected && styles.availableTagTextSelected]}>
                  {word}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Next button */}
      <TouchableOpacity
        style={[styles.nextBtn, (canProceed && !verifying) ? styles.nextBtnActive : styles.nextBtnDisabled]}
        onPress={handleNext}
        disabled={!canProceed || verifying}
        activeOpacity={0.7}
      >
        {verifying ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={[styles.nextBtnText, (canProceed && !verifying) ? styles.nextBtnTextActive : styles.nextBtnTextDisabled]}>
            下一步
          </Text>
        )}
      </TouchableOpacity>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
  },
  // Selected area
  selectedArea: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    minHeight: 150,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  emptyHint: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  selectedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectedTag: {
    backgroundColor: "#E8F9B0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectedTagWrong: {
    backgroundColor: "#FEE2E2",
  },
  selectedTagText: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "500",
  },
  selectedTagTextWrong: {
    color: "#EF4444",
  },
  wrongX: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "700",
  },
  // Available area
  availableArea: {
    marginBottom: 24,
  },
  availableRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  availableTag: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  availableTagSelected: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  availableTagText: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "500",
  },
  availableTagTextSelected: {
    color: "#9CA3AF",
  },
  // Next button
  nextBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  nextBtnActive: {
    backgroundColor: "#287220",
  },
  nextBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  nextBtnText: {
    fontSize: 18,
    fontWeight: "600",
  },
  nextBtnTextActive: {
    color: "#FFFFFF",
  },
  nextBtnTextDisabled: {
    color: "#9CA3AF",
  },
  // Toast
  toastWrap: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
});