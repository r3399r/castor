import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

/// Thin HTTP client mirroring webapp/lib/api.ts's conventions: attaches the
/// current Firebase ID token as a raw `Authorization` header (no `Bearer`
/// prefix -- backend_new/src/lib/firebaseAdmin.ts's verifiers expect it
/// raw), and retries once with a force-refreshed token on a 401 (ID tokens
/// expire hourly and a cached one can go stale mid-session).
class ApiClient {
  ApiClient._();

  static Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$apiBaseUrl/api/$path').replace(queryParameters: query);

  static Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _request('GET', _uri(path, query));

  /// [token] lets callers (namely AuthService right after sign-in) pass an
  /// explicitly fresh token instead of relying on FirebaseAuth.currentUser,
  /// which may not have settled yet immediately post-sign-in.
  static Future<dynamic> post(String path, Object body, {String? token}) =>
      _request('POST', _uri(path), body: body, explicitToken: token);

  static Future<dynamic> put(String path, Object body) =>
      _request('PUT', _uri(path), body: body);

  static Future<void> delete(String path) => _request('DELETE', _uri(path));

  static Future<dynamic> _request(
    String method,
    Uri uri, {
    Object? body,
    String? explicitToken,
  }) async {
    final res = await _send(method, uri, body, explicitToken);
    if (res.statusCode != 401 || explicitToken != null) return _decode(res);

    final refreshed = await FirebaseAuth.instance.currentUser?.getIdToken(
      true,
    );
    if (refreshed == null) return _decode(res);
    final retryRes = await _send(method, uri, body, refreshed);
    return _decode(retryRes);
  }

  static Future<http.Response> _send(
    String method,
    Uri uri,
    Object? body,
    String? explicitToken,
  ) async {
    final token =
        explicitToken ?? await FirebaseAuth.instance.currentUser?.getIdToken();
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': token,
    };
    final encodedBody = body != null ? jsonEncode(body) : null;
    switch (method) {
      case 'GET':
        return http.get(uri, headers: headers);
      case 'POST':
        return http.post(uri, headers: headers, body: encodedBody);
      case 'PUT':
        return http.put(uri, headers: headers, body: encodedBody);
      case 'DELETE':
        return http.delete(uri, headers: headers);
      default:
        throw ArgumentError('Unsupported method: $method');
    }
  }

  static dynamic _decode(http.Response res) {
    if (res.statusCode >= 400) throw ApiException(res.statusCode, res.body);
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.body);

  final int statusCode;
  final String body;

  @override
  String toString() => 'ApiException($statusCode): $body';
}
