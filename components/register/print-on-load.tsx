"use client";

import { useEffect } from "react";

export default function PrintOnLoad() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}
