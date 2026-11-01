import 'package:flutter/material.dart';

import 'theme/app_theme.dart';
import 'widgets/root_shell.dart';

void main() {
  runApp(const CastorApp());
}

class CastorApp extends StatelessWidget {
  const CastorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // Shown in the Android task switcher, so it is the brand name, not
      // the repo's codename (which the class name below still carries).
      title: '學益',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const RootShell(),
    );
  }
}
