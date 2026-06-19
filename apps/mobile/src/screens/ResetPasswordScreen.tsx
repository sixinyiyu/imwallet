import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { validateMnemonic, cleanMnemonic, validateMnemonicWords, searchBip39Words } from "../utils/mnemonic";
import * as SecureStore from "../utils/secureStorage";
import { uploadLog } from "../services/logService";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { useAlert } from "../hooks/useAlert";

type Nav = NativeStackNavigationProp<RootStackParamList, "ResetPassword">;
type RouteType = RouteProp<RootStackParamList, "ResetPassword">;

const MNEMONIC_KEY_PREFIX = "aquad_mnemonic_";

function mnemonicKey(walletId: string): string {
  return `${MNEMONIC_KEY_PREFIX}${walletId}`;
}

/** Password strength */
function getPasswordStrength(pwd: string): { level: number; label: string; color: string } {
  if (!pwd || pwd.length === 0) return { level: 0, label: "", color: "#E5E7EB" };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;
  if (score <= 1) return { level: 1, label: "弱", color: "#EF4444" };
  if (score <= 2) return { level: 2, label: "一般", color: "#F59E0B" };
  if (score <= 3) return { level: 3, label: "强", color: "#3B82F6" };
  return { level: 4, label: "很好", color: "#10B981" };
}

const LEARN_CONTENT = "助记词是明文私钥的另一种表现形式，最早是由 BIP39 提案提出，其目的是为了帮助用户记忆复杂的私钥。助记词一般由 12、15、18、21 个单词构成，这些单词都取自一个固定词库，其生成顺序也是按照一定算法而来，所以用户没必要担心随便输入 12 个单词就会生成一个地址。\n\n拥有助记词等于拥有钱包代币的控制权，如果你移除了钱包或者更换了手机设备，可以通过将助记词「导入钱包」的方式恢复钱包。\n\n\n如何导入钱包？\n请根据你当前的使用情况，选择对应的操作步骤：\n\n一、新下载安装 App\n1. 打开 App，点击「导入钱包」\n2. 在导入方式中选择「助记词」\n3. 依次输入单词并确保每个单词之间用空格隔开\n   💡如果导入时提示错误无法导入，请检查助记词是否正确\n4. 设置钱包名称、密码、密码提示等信息\n5. 添加账户：勾选你要添加的公链和网络，完成账户导入\n\n二、App 内已有钱包，想导入其它钱包：\n1. 打开 App，依次点击「我」 - 「钱包管理」\n2. 点击下方的「+ 添加钱包」 - 「导入钱包」 - 「助记词」\n3. 依次输入单词并确保每个单词之间用空格隔开\n4. 后续步骤与上述一致\n\n\n注意事项：\n• 如果导入恢复的地址与原钱包地址不一致，说明导入的助记词是错误的，请重新导入正确的助记词。\n• 助记词泄漏会导致代币被盗，请务必妥善保管你的助记词。\n";

export default function ResetPasswordScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { resetPassword } = useWalletStore();

  // Step state: 1 = verify mnemonic, 2 = create new password
  const [step, setStep] = useState(1);
  const [validatedMnemonic, setValidatedMnemonic] = useState("");

  // Step 1: mnemonic
  const [mnemonicInput, setMnemonicInput] = useState("");

  // Auto-clean mnemonic on input
  const handleMnemonicInputChange = (text: string) => {
    const trailingSpace = text.endsWith(' ') ? ' ' : '';
    const cleaned = text
      .split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0)
      .join(' ');
    setMnemonicInput(cleaned + trailingSpace);
  };
  const [loading, setLoading] = useState(false);
  const [showLearnModal, setShowLearnModal] = useState(false);

  // Step 2: new password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const isStep2Valid =
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  // ─── Mnemonic autocomplete ───
  const suggestions = useMemo(() => {
    if (!mnemonicInput) return [];
    // Get the last word being typed (after the last space)
    const parts = mnemonicInput.split(/\s+/);
    const lastPart = parts[parts.length - 1] || "";
    // Only show suggestions when typing a word (not right after a space)
    if (!lastPart || mnemonicInput.endsWith(" ")) return [];
    return searchBip39Words(lastPart, 8);
  }, [mnemonicInput]);

  const handleSelectWord = useCallback((word: string) => {
    // Replace the last partial word with the selected word + space
    const parts = mnemonicInput.split(/\s+/);
    parts[parts.length - 1] = word;
    setMnemonicInput(parts.join(" ") + " ");
  }, [mnemonicInput]);

  const handleValidateMnemonic = async () => {
    try {
      const cleaned = cleanMnemonic(mnemonicInput);
      if (!cleaned) {
        alert("提示", "请输入助记词");
        return;
      }

      const wordCheck = validateMnemonicWords(cleaned);
      if (wordCheck.wordCount !== 12 && wordCheck.wordCount !== 24) {
        alert("提示", `助记词需要12或24个单词，当前输入了${wordCheck.wordCount}个单词`);
        return;
      }
      if (wordCheck.invalidWords.length > 0) {
        const displayWords = wordCheck.invalidWords.length > 3
          ? wordCheck.invalidWords.slice(0, 3).join("、") + "..."
          : wordCheck.invalidWords.join("、");
        alert("提示", `以下单词不在助记词词表中：${displayWords}，请检查拼写`);
        return;
      }

      const isValid = await validateMnemonic(cleaned);
      if (!isValid) {
        alert("提示", "助记词校验失败，请确认助记词顺序和内容是否正确");
        return;
      }

      if (!walletId) {
        alert("提示", "钱包信息缺失");
        return;
      }

      setLoading(true);
      const stored = await SecureStore.getItemAsync(mnemonicKey(walletId));
      if (!stored) {
        setLoading(false);
        alert("无法验证", "该钱包未在本地存储助记词，无法通过助记词验证重置密码。仅支持通过助记词创建或导入的钱包。", [
          { text: "知道了" },
        ]);
        return;
      }
      if (stored.trim() === cleaned) {
        setLoading(false);
        setValidatedMnemonic(cleaned);
        setStep(2);
      } else {
        setLoading(false);
        alert("验证失败", "助记词与当前钱包不匹配，请检查后重试");
      }
    } catch (err: any) {
      setLoading(false);
      uploadLog("business", `[ResetPassword] handleValidateMnemonic error: ${err?.message || String(err)}`);
      alert("错误", err.message || "验证失败，请稍后重试");
    }
  };

  const handleSubmitNewPassword = async () => {
    if (!walletId) return;
    if (newPassword.length < 8) {
      alert("提示", "密码至少需要8个字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("提示", "两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(
        walletId,
        validatedMnemonic,
        newPassword,
        passwordHint.trim() || undefined,
      );
      navigation.pop(2);
    } catch (err: any) {
      alert("重置失败", err.message || "请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Step 1: Import Mnemonic ───
  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step indicator: 1/2 */}
          <View style={styles.stepRow}>
            <Text style={styles.stepActive}>1</Text>
            <Text style={styles.stepSeparator}>/</Text>
            <Text style={styles.stepTotal}>2</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={styles.progressFill} />
          </View>

          <Text style={styles.title}>导入助记词</Text>
          <Text style={styles.description}>
            提供当前钱包的正确助记词以完成验证。
          </Text>

          <TouchableOpacity
            onPress={() => setShowLearnModal(true)}
            activeOpacity={0.6}
          >
            <Text style={styles.learnMoreLink}>了解助记词</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.mnemonicInput}
            placeholder="输入助记单词，并使用空格分割"
            placeholderTextColor="#9CA3AF"
            value={mnemonicInput}
            onChangeText={handleMnemonicInputChange}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoFocus
          />
        </ScrollView>

        {/* Word suggestions — below textarea, above keyboard on mobile */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {suggestions.map((word) => (
                <TouchableOpacity
                  key={word}
                  style={styles.suggestionChip}
                  onPress={() => handleSelectWord(word)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.suggestionText}>{word}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.importBtn,
              (!mnemonicInput.trim() || loading) && styles.importBtnDisabled,
            ]}
            onPress={handleValidateMnemonic}
            disabled={!mnemonicInput.trim() || loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.importBtnText}>马上导入</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 了解助记词弹窗 */}
        <Modal visible={showLearnModal} transparent animationType="slide" onRequestClose={() => setShowLearnModal(false)}>
          <Pressable style={styles.learnOverlay} onPress={() => setShowLearnModal(false)}>
            <Pressable style={styles.learnDrawer} onPress={(e) => e.stopPropagation()}>
              <View style={styles.learnHeader}>
                <Text style={styles.learnTitle}>什么是助记词？</Text>
                <TouchableOpacity onPress={() => setShowLearnModal(false)} activeOpacity={0.6} style={styles.learnCloseBtn}>
                  <Text style={styles.learnCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.learnScroll} contentContainerStyle={styles.learnScrollContent}>
                <Text style={styles.learnBody}>{LEARN_CONTENT}</Text>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // ─── Step 2: Create New Password ───
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step indicator: 2/2 */}
        <View style={styles.stepRow}>
          <Text style={styles.stepActive}>2</Text>
          <Text style={styles.stepSeparator}>/</Text>
          <Text style={styles.stepTotal}>2</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={styles.progressFillFull} />
        </View>

        <Text style={styles.title}>创建新密码</Text>
        <Text style={styles.description}>
          密码将用于在当前设备的交易授权和钱包解锁。
        </Text>
        <Text style={styles.descriptionNote}>
          AquaD 不会存储你的密码，请妥善保管。
        </Text>

        <Text style={styles.label}>创建密码</Text>
        {/* Password card: input password + divider + repeat password */}
        <View style={styles.passwordCard}>
          {/* Input password row: strength indicator on right */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder="输入密码"
              placeholderTextColor="#C8C9CC"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
            />
            {newPassword.length > 0 && (
              <View style={styles.strengthWrap}>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                <View style={styles.strengthLines}>
                  {[1, 2, 3, 4].map((i) => (
                    <View key={i} style={[styles.strengthLine, { backgroundColor: strength.level >= i ? strength.color : "#E5E7EB" }]} />
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Repeat password row: eye icon on right */}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputField, confirmPassword.length > 0 && newPassword !== confirmPassword && styles.inputError]}
              placeholder="重复密码"
              placeholderTextColor="#C8C9CC"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              activeOpacity={0.6}
            >
              {showConfirmPassword ? <EyeIcon size={20} color="#8899B8" /> : <EyeOffIcon size={20} color="#C4C5C5" />}
            </TouchableOpacity>
          </View>
        </View>
        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <Text style={styles.errorHint}>两次输入的密码不一致</Text>
        )}

        <Text style={styles.label}>密码提示（可选）</Text>
        <TextInput
          style={styles.hintInput}
          placeholder="输入提醒文字"
          placeholderTextColor="#C8C9CC"
          value={passwordHint}
          onChangeText={setPasswordHint}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!isStep2Valid || submitting) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmitNewPassword}
          disabled={!isStep2Valid || submitting}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>提交</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  // Step indicator
  stepRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
  },
  stepActive: {
    fontSize: 20,
    fontWeight: "700",
    color: "#287220",
  },
  stepSeparator: {
    fontSize: 16,
    fontWeight: "500",
    color: "#9CA3AF",
    marginHorizontal: 2,
  },
  stepTotal: {
    fontSize: 16,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  progressBar: {
    flexDirection: "row",
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#E5E7EB",
    marginBottom: 24,
    alignSelf: "flex-start",
    width: 30,
  },
  progressFill: {
    width: "50%",
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#287220",
  },
  progressFillFull: {
    width: "100%",
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#287220",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
    marginBottom: 4,
  },
  descriptionNote: {
    fontSize: 14,
    color: "#9CA3AF",
    lineHeight: 22,
    marginBottom: 24,
  },
  learnMoreLink: {
    fontSize: 14,
    color: "#287220",
    fontWeight: "500",
    marginBottom: 24,
  },
  // Word suggestions bar (between textarea and footer, above keyboard on mobile)
  suggestionsBar: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: "#F5F6F8",
  },
  suggestionChip: {
    backgroundColor: "#E8F9B0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#A5D6A7",
  },
  suggestionText: {
    fontSize: 14,
    color: "#287220",
    fontWeight: "500",
  },
  mnemonicInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#1F2937",
    minHeight: 120,
    textAlignVertical: "top",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  // Step 2 styles
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2C3E50",
    marginBottom: 8,
  },
  passwordCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputField: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: "#2C3E50",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  divider: {
    height: 1,
    backgroundColor: "#EAEBEE",
  },
  eyeBtn: {
    padding: 14,
    paddingLeft: 4,
  },
  // Strength indicator
  strengthWrap: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 14,
  },
  strengthLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#3B82F6",
    marginBottom: 4,
  },
  strengthLines: {
    flexDirection: "column",
    gap: 3,
  },
  strengthLine: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
  },
  errorHint: {
    fontSize: 12,
    color: "#EF4444",
    marginBottom: 12,
    marginLeft: 4,
  },
  hintInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#2C3E50",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: "#F5F6F8",
  },
  importBtn: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  importBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  importBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  submitBtn: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  // 了解助记词弹窗
  learnOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  learnDrawer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  learnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  learnTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  learnCloseBtn: {
    padding: 4,
  },
  learnCloseText: {
    fontSize: 20,
    color: "#9CA3AF",
  },
  learnScroll: {
    paddingHorizontal: 24,
  },
  learnScrollContent: {
    paddingBottom: 40,
  },
  learnBody: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 24,
  },
});