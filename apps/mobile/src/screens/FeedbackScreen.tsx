import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import api from "../services/api";
import { configService } from "../services/configService";

export default function FeedbackScreen() {
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setResultMsg(null);
    try {
      const { data } = await api.post("/config/feedback", {
        content: content.trim(),
        contact: contact.trim(),
      });
      // 处理 code：匹配成功后缓存标识
      if (data.code) {
        await configService.setFeedbackCode(data.code);
      }
      setResultMsg(data.message || "感谢您的反馈！");
      // 清空输入
      setContent("");
      setContact("");
    } catch (err: any) {
      setResultMsg(err?.response?.data?.message || "提交失败，请稍后重试");
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>反馈与建议</Text>
        <Text style={styles.desc}>
          我们重视每一位用户的意见，请告诉我们您的想法、遇到的问题或改进建议。
        </Text>

        <Text style={styles.label}>反馈内容</Text>
        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={setContent}
          placeholder="请描述您的反馈或建议..."
          placeholderTextColor="#C8C9CC"
          multiline
          maxLength={500}
          autoFocus
        />

        <Text style={styles.label}>联系方式（可选）</Text>
        <TextInput
          style={styles.contactInput}
          value={contact}
          onChangeText={setContact}
          placeholder="邮箱或其他联系方式"
          placeholderTextColor="#C8C9CC"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <TouchableOpacity
          style={[styles.submitBtn, (!content.trim() || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!content.trim() || submitting}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>提交反馈</Text>
          )}
        </TouchableOpacity>

        {resultMsg && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{resultMsg}</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    margin: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  desc: { fontSize: 13, color: "#9CA3AF", lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6 },
  contentInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#1F2937",
    minHeight: 120,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  contactInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#1F2937",
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: "#287220",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { backgroundColor: "#A5D6A7" },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  resultBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 14,
    marginTop: 16,
  },
  resultText: { fontSize: 14, color: "#374151", textAlign: "center", lineHeight: 20 },
});