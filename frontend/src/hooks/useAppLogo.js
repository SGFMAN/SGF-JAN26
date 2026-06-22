import { useMemo } from "react";
import defaultLogo from "../images/logo.png";
import retroLogo from "../images/WIN95.png";
import { useUiTheme } from "../context/UiThemeProvider";
import { RETRO_THEME_ID } from "../utils/retroWin31Cursor.js";

export function getAppLogoForTheme(themeId) {
  return themeId === RETRO_THEME_ID ? retroLogo : defaultLogo;
}

export default function useAppLogo() {
  const { themeId } = useUiTheme();
  return useMemo(() => getAppLogoForTheme(themeId), [themeId]);
}
