import { useState, useMemo, useRef, useEffect } from "react";
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
  Keyboard,
  Animated,
  Easing,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { validateMnemonic, cleanMnemonic, validateMnemonicWords, generateIdentifier } from "../utils/mnemonic";
import { useAlert } from "../hooks/useAlert";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { getErrorMessage } from "../utils/format";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletImport">;

/** 密码强度计算 */
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

/** Import overlay with rotating dashed circle and stage text */
function ImportOverlay({ visible, stage }: { visible: boolean; stage: string }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const rotate = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    rotate.start();
    pulseAnim.start();
    return () => {
      rotate.stop();
      pulseAnim.stop();
    };
  }, [visible]);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={importOverlayStyles.mask}>
        <View style={importOverlayStyles.content}>
          <Animated.View style={[importOverlayStyles.circleWrapper, { transform: [{ rotate: rotateInterpolate }, { scale: pulse }] }]}>
            <View style={importOverlayStyles.dashedCircle} />
          </Animated.View>
          <Text style={importOverlayStyles.text}>{stage || "导入中"}</Text>
        </View>
      </View>
    </Modal>
  );
}

const importOverlayStyles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    justifyContent: "center",
    alignItems: "center",
  },
  circleWrapper: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  dashedCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderStyle: "dashed",
  },
  text: {
    position: "absolute",
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});

export default function WalletImportScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const { importWallet, wallets } = useWalletStore();

  // Step state: 1 = mnemonic input, 2 = wallet settings
  const [step, setStep] = useState(1);
  const [validatedMnemonic, setValidatedMnemonic] = useState("");

  // 重复助记词提示弹窗
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Step 1: mnemonic
  const [mnemonic, setMnemonic] = useState("");

  // Auto-clean mnemonic on input: trim each word, collapse whitespace, lowercase
  const handleMnemonicChange = (text: string) => {
    // Preserve trailing space for word separation during typing
    const trailingSpace = text.endsWith(' ') ? ' ' : '';
    const cleaned = text
      .split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0)
      .join(' ');
    setMnemonic(cleaned + trailingSpace);
  };
  const [validating, setValidating] = useState(false);

  // Step 2: wallet settings
  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("导入中");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const isStep2Valid =
    alias.trim().length > 0 &&
    password.length >= 8 &&
    password === confirmPassword;

  /** Step 1: Validate mnemonic and proceed */
  const handleValidateMnemonic = async () => {
    const cleaned = cleanMnemonic(mnemonic);
    if (!cleaned) {
      alert("提示", "请输入助记词");
      return;
    }

    setValidating(true);

    const wordCheck = validateMnemonicWords(cleaned);
    if (wordCheck.wordCount !== 12 && wordCheck.wordCount !== 24) {
      alert("提示", `助记词需要12或24个单词，当前输入了${wordCheck.wordCount}个单词`);
      setValidating(false);
      return;
    }
    if (wordCheck.invalidWords.length > 0) {
      const displayWords = wordCheck.invalidWords.length > 3
        ? wordCheck.invalidWords.slice(0, 3).join("、") + "..."
        : wordCheck.invalidWords.join("、");
      alert("提示", `以下单词不在助记词词表中：${displayWords}，请检查拼写`);
      setValidating(false);
      return;
    }

    if (!(await validateMnemonic(cleaned))) {
      alert("提示", "助记词校验失败，请确认助记词顺序和内容是否正确");
      setValidating(false);
      return;
    }

    // 检查助记词是否已在当前设备上导入过
    // generateIdentifier 是确定性函数：同一助记词 → 同一 walletId
    const walletId = generateIdentifier(cleaned);
    if (wallets.some((w) => w.id === walletId)) {
      setValidating(false);
      setShowDuplicateModal(true);
      return;
    }

    setValidatedMnemonic(cleaned);
    setValidating(false);
    setStep(2);
  };

  /** Step 2: Import wallet with validated mnemonic */
  const handleImportWallet = async () => {
    if (!alias.trim()) {
      alert("提示", "请输入钱包别名");
      return;
    }
    if (password.length < 8) {
      alert("提示", "密码至少需要8个字符");
      return;
    }
    if (password !== confirmPassword) {
      alert("提示", "两次输入的密码不一致");
      return;
    }

    setLoading(true);
    setLoadingStage("正在加密数据...");
    const stageTimer1 = setTimeout(() => setLoadingStage("正在注册钱包..."), 800);
    const stageTimer2 = setTimeout(() => setLoadingStage("正在跳转..."), 1600);
    try {
      const walletId = await importWallet(validatedMnemonic, alias.trim(), password, passwordHint.trim() || undefined);
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setLoadingStage("正在跳转...");
      navigation.replace("WalletAddAccount", { walletId });
    } catch (err: unknown) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      alert("导入失败", getErrorMessage(err, "请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 1: Mnemonic Input (white background) ───
  if (step === 1) {
    return (
      <KeyboardAvoidingView style={s1.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s1.scrollContent} keyboardShouldPersistTaps="handled">
          {/* 点击空白区域收起键盘 */}
          <Pressable style={s1.inner} onPress={Keyboard.dismiss}>
            <View style={s1.header}>
          <Text style={s1.title}>导入助记词</Text>
          <Text style={s1.desc}>
            输入助记词来添加或恢复你的钱包。导入的助记词将被加密并安全存储在你的设备上。为了你的资产安全，AquaD 不会存储你的助记词。
          </Text>
        </View>

        <View style={s1.body}>
          <TextInput
            style={s1.mnemonicInput}
            placeholder="输入助记单词，并使用空格分割"
            placeholderTextColor="#9CA3AF"
            value={mnemonic}
            onChangeText={handleMnemonicChange}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
            autoFocus
          />
        </View>

        <View style={s1.footer}>
          <TouchableOpacity
            style={[s1.button, (!mnemonic.trim() || validating) && s1.buttonDisabled]}
            onPress={handleValidateMnemonic}
            disabled={!mnemonic.trim() || validating}
            activeOpacity={0.7}
          >
            {validating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s1.buttonText}>马上导入</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 重复助记词提示弹窗 */}
        <Modal visible={showDuplicateModal} transparent animationType="fade">
          <Pressable style={s1.modalOverlay} onPress={() => setShowDuplicateModal(false)}>
            <View style={s1.modalCard}>
              <Text style={s1.modalTitle}>提示</Text>
              <Text style={s1.modalMsg}>相同的助记词已经导入过，无法再次导入</Text>
              <TouchableOpacity
                style={s1.modalBtn}
                onPress={() => setShowDuplicateModal(false)}
                activeOpacity={0.7}
              >
                <Text style={s1.modalBtnText}>我知道了</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Step 2: Wallet Settings (white background) ───
  return (
    <>
      {/* 导入加载遮罩 */}
      <ImportOverlay visible={loading} stage={loadingStage} />
      <KeyboardAvoidingView
        style={s2.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={s2.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s2.header}>
          <Text style={s2.title}>设置你的钱包</Text>
          <Text style={s2.subtitle}>为你的钱包设置一个方便自己识别的名称。创建钱包密码，并确保密码的安全。</Text>
        </View>

        <View style={s2.form}>
          <Text style={s2.label}>钱包别名</Text>
          <TextInput
            style={s2.input}
            placeholder="例如：我的主钱包"
            placeholderTextColor="#C8C9CC"
            value={alias}
            onChangeText={setAlias}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          <Text style={s2.label}>创建密码</Text>
          {/* 密码卡片：输入密码 + 分割线 + 重复密码 */}
          <View style={s2.passwordCard}>
            {/* 输入密码行：右侧显示强度指示器 */}
            <View style={s2.inputRow}>
              <TextInput
                style={s2.inputField}
                placeholder="输入密码"
                placeholderTextColor="#C8C9CC"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {password.length > 0 && (
                <View style={s2.strengthWrap}>
                  <Text style={[s2.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                  <View style={s2.strengthLines}>
                    {[1, 2, 3, 4].map((i) => (
                      <View key={i} style={[s2.strengthLine, { backgroundColor: strength.level >= i ? strength.color : "#E5E7EB" }]} />
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={s2.divider} />

            {/* 重复密码行：右侧眼睛icon */}
            <View style={s2.inputRow}>
              <TextInput
                style={[s2.inputField, confirmPassword.length > 0 && password !== confirmPassword && s2.inputError]}
                placeholder="重复密码"
                placeholderTextColor="#C8C9CC"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={s2.eyeBtn}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                activeOpacity={0.6}
              >
                {showConfirmPassword ? <EyeIcon size={20} color="#8899B8" /> : <EyeOffIcon size={20} color="#C4C5C5" />}
              </TouchableOpacity>
            </View>
          </View>
          {password.length > 0 && password.length < 8 && (
            <Text style={s2.errorHint}>密码至少需要8个字符</Text>
          )}
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <Text style={s2.errorHint}>两次输入的密码不一致</Text>
          )}

          <Text style={s2.label}>密码提示（可选）</Text>
          <TextInput
            style={s2.input}
            placeholder="输入提醒文字"
            placeholderTextColor="#C8C9CC"
            value={passwordHint}
            onChangeText={setPasswordHint}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
          />

          <TouchableOpacity
            style={[s2.button, (!isStep2Valid || loading) && s2.buttonDisabled]}
            onPress={handleImportWallet}
            disabled={!isStep2Valid || loading}
            activeOpacity={0.7}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s2.buttonText}>继续</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </>
  );
}

// ─── Step 1 Styles (white background) ───
const s1 = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  inner: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "left",
    marginBottom: 12,
  },
  desc: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "left",
    lineHeight: 22,
  },
  body: {
    flex: 1,
  },
  mnemonicInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    color: "#1F2937",
    minHeight: 200,
    textAlignVertical: "top",
  },
  footer: {
    paddingTop: 16,
  },
  button: {
    backgroundColor: "#287220",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // 重复助记词弹窗
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 16,
  },
  modalMsg: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalBtn: {
    backgroundColor: "#287220",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});

// ─── Step 2 Styles (white background) ───
const s2 = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 },
  header: { marginBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "left",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "left",
    lineHeight: 22,
  },
  form: { width: "100%" },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2C3E50",
    marginBottom: 8,
  },
  input: {
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

  // 密码卡片
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

  // 输入行容器
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
  inputError: { borderColor: "#EF4444" },

  // 强度指示器
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

  divider: { height: 1, backgroundColor: "#EAEBEE" },

  eyeBtn: { padding: 14, paddingLeft: 4 },

  errorHint: { fontSize: 12, color: "#EF4444", marginBottom: 12, marginLeft: 4 },

  // 继续按钮
  button: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});