import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";

const noDataImage = require("../../assets/no_data.png");

interface Props {
  message?: string;
}

export default function EmptyState({ message }: Props) {
  return (
    <View style={styles.container}>
      <Image source={noDataImage} style={styles.image} resizeMode="contain" />
      <Text style={styles.text}>{message ?? "暂无数据"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
  image: {
    width: 120,
    height: 120,
    marginBottom: 16,
  },
  text: {
    fontSize: 14,
    color: "#9CA3AF",
  },
});
