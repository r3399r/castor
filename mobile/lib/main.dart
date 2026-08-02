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
      title: 'Castor',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const RootShell(),
    );
  }
}
