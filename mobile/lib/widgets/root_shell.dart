import 'package:flutter/material.dart';

import '../pages/adaptive_page.dart';
import '../pages/analysis_page.dart';
import '../pages/box_page.dart';
import '../pages/reply_tabs_page.dart';
import '../pages/user_page.dart';
import '../theme/app_theme.dart';

/// Bottom nav order (left to right): 作答記錄 / 學習分析 / 智慧練習 / 禮物盒 /
/// 個人資料. 智慧練習 sits in the prominent, larger, differently-colored
/// center slot (a FAB docked into a notch in the bottom bar) since it's the
/// app's primary action -- the other four are plain icon+label buttons
/// either side of it. IndexedStack keeps each tab's own state alive across
/// switches instead of rebuilding it from scratch every time it's selected.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  // 智慧練習 (index 2) is still the tab that opens by default.
  int _selectedIndex = 2;

  void _goToTab(int index) => setState(() => _selectedIndex = index);

  static const _pages = [
    ReplyTabsPage(),
    AnalysisPage(),
    AdaptivePage(),
    BoxPage(),
    UserPage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _selectedIndex, children: _pages),
      floatingActionButton: _CenterNavButton(
        selected: _selectedIndex == 2,
        onTap: () => _goToTab(2),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: BottomAppBar(
        color: AppColors.beige200,
        shape: const CircularNotchedRectangle(),
        notchMargin: 10,
        height: 90,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _NavIconButton(
              icon: Icons.fact_check_outlined,
              selectedIcon: Icons.fact_check,
              label: '作答記錄',
              selected: _selectedIndex == 0,
              onTap: () => _goToTab(0),
            ),
            _NavIconButton(
              icon: Icons.insights_outlined,
              selectedIcon: Icons.insights,
              label: '學習分析',
              selected: _selectedIndex == 1,
              onTap: () => _goToTab(1),
            ),
            // Reserves the notch's width -- the FAB itself floats above this.
            const SizedBox(width: 56),
            _NavIconButton(
              icon: Icons.card_giftcard_outlined,
              selectedIcon: Icons.card_giftcard,
              label: '禮物盒',
              selected: _selectedIndex == 3,
              onTap: () => _goToTab(3),
            ),
            _NavIconButton(
              icon: Icons.person_outline,
              selectedIcon: Icons.person,
              label: '個人資料',
              selected: _selectedIndex == 4,
              onTap: () => _goToTab(4),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavIconButton extends StatelessWidget {
  const _NavIconButton({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.blue700 : AppColors.black500;
    return InkWell(
      onTap: onTap,
      customBorder: const StadiumBorder(),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? selectedIcon : icon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: selected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 智慧練習's nav slot -- a bigger, circular, distinctly-colored FAB instead
/// of a flat icon button, docked in the bottom bar's notch so it visually
/// pops out above the row.
class _CenterNavButton extends StatelessWidget {
  const _CenterNavButton({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      onPressed: onTap,
      backgroundColor: AppColors.blue700,
      foregroundColor: Colors.white,
      shape: const CircleBorder(),
      elevation: selected ? 6 : 3,
      tooltip: '智慧練習',
      child: const Icon(Icons.auto_awesome, size: 28),
    );
  }
}
