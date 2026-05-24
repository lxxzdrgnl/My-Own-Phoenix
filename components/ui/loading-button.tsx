"use client";

import * as React from "react";
import { Button } from "./button";

type ButtonProps = React.ComponentProps<typeof Button>;

export function LoadingButton({
  loading,
  loadingText = "처리 중...",
  disabled,
  children,
  ...rest
}: ButtonProps & {
  loading?: boolean;
  loadingText?: string;
}) {
  return (
    <Button {...rest} disabled={disabled || loading}>
      {loading ? loadingText : children}
    </Button>
  );
}
