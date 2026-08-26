INSERT INTO castor.guardian
(id, code, name, theme, cost, sort_order, is_active, created_at, updated_at)
VALUES
(null, 'forest', '森林之蛋', '森林保育', 20, 0, 1, now(3), NULL),
(null, 'ocean', '海洋之蛋', '海洋保育', 30, 1, 1, now(3), NULL),
(null, 'animal', '毛孩之蛋', '動物救援', 35, 2, 1, now(3), NULL),
(null, 'warmth', '暖光之蛋', '無家者援助', 40, 3, 1, now(3), NULL),
(null, 'wisdom', '智慧之蛋', '教育公益', 45, 4, 1, now(3), NULL),
(null, 'healing', '療癒之蛋', '醫療援助', 50, 5, 1, now(3), NULL);
