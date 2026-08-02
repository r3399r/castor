import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Shown on every page for now since no backend calls are wired up yet --
/// swap this out page by page as each screen gets real data.
class ComingSoonNotice extends StatelessWidget {
  const ComingSoonNotice({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.beige200,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brown300),
      ),
      child: Column(
        children: [
          const Icon(Icons.construction_outlined, color: AppColors.brown700, size: 32),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.black500, fontSize: 14, height: 1.5),
          ),
        ],
      ),
    );
  }
}
