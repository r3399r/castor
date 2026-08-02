import 'package:flutter/material.dart';

import '../pages/adaptive_page.dart';
import '../pages/reply_page.dart';
import '../pages/user_page.dart';
import '../pages/wrong_page.dart';

/// Bottom navigation bar mirroring the web app's top navbar
/// (webapp/components/NavbarMenu.tsx): 智慧練習 / 作答記錄 / 錯題本 / 學習分析.
/// 智慧練習 is the first tab and doubles as the app's home screen -- there's
/// no separate landing page. IndexedStack keeps each tab's own state alive
/// across switches instead of rebuilding it from scratch every time it's
/// selected.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _selectedIndex = 0;

  void _goToTab(int index) => setState(() => _selectedIndex = index);

  static const _destinations = [
    NavigationDestination(
      icon: Icon(Icons.auto_awesome_outlined),
      selectedIcon: Icon(Icons.auto_awesome),
      label: '智慧練習',
    ),
    NavigationDestination(
      icon: Icon(Icons.fact_check_outlined),
      selectedIcon: Icon(Icons.fact_check),
      label: '作答記錄',
    ),
    NavigationDestination(
      icon: Icon(Icons.error_outline),
      selectedIcon: Icon(Icons.error),
      label: '錯題本',
    ),
    NavigationDestination(
      icon: Icon(Icons.insights_outlined),
      selectedIcon: Icon(Icons.insights),
      label: '學習分析',
    ),
  ];

  static const _pages = [
    AdaptivePage(),
    ReplyPage(),
    WrongPage(),
    UserPage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _selectedIndex, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _goToTab,
        destinations: _destinations,
      ),
    );
  }
}
