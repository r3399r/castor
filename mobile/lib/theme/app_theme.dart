import 'package:flutter/material.dart';

/// Mirrors the web app's Tailwind palette (webapp/app/globals.css) so the
/// mobile app reads as the same product rather than a re-skin.
class AppColors {
  AppColors._();

  static const black900 = Color(0xFF302B28);
  static const black700 = Color(0xFF4E4946);
  static const black500 = Color(0xFF625D5A);
  static const brown900 = Color(0xFF614F43);
  static const brown700 = Color(0xFF89776B);
  static const brown300 = Color(0xFFC5B3A7);
  static const blue700 = Color(0xFF2E4FB6);
  static const blue500 = Color(0xFF5D7ED8);
  static const beige100 = Color(0xFFFCF9F5);
  static const beige200 = Color(0xFFF1EDE9);
  static const orange700 = Color(0xFFB5502E);

  // blue700 at ~12% alpha, precomputed so this doesn't depend on whichever
  // Color opacity API happens to be current in the installed Flutter version.
  static const blue700Faded = Color(0x1F2E4FB6);
}

ThemeData buildAppTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: AppColors.blue700,
    brightness: Brightness.light,
  ).copyWith(
    primary: AppColors.blue700,
    secondary: AppColors.brown700,
    surface: AppColors.beige100,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppColors.beige100,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.beige100,
      foregroundColor: AppColors.blue700,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.blue700,
        fontSize: 20,
        fontWeight: FontWeight.bold,
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: AppColors.beige200,
      indicatorColor: AppColors.blue700Faded,
      elevation: 0,
    ),
  );
}
