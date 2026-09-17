"use client";
import { useEffect } from "react";
import { carregarModo, aplicarModo } from "../lib/tema";

export default function TemaProvider() {
  useEffect(() => {
    aplicarModo(carregarModo());
  }, []);
  return null;
}
