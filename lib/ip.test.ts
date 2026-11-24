import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedIp } from './ip.ts';

test('internal IPv4 addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255']) {
    assert.equal(blockedIp(ip), true, ip);
  }
});

test('IPv6 tricks that hide internal addresses are blocked', () => {
  for (const ip of [
    '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:0001', '::ffff:a9fe:a9fe', '::127.0.0.1', '::a00:1',
    '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2002:c0a8:101::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1', '100::1',
    '::ffff:10.0.0.1', '::FFFF:192.168.0.1',
  ]) assert.equal(blockedIp(ip), true, ip);
});

test('public addresses are allowed', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '185.15.59.224', '2a02:ec80:300:ed1a::1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
    assert.equal(blockedIp(ip), false, ip);
  }
});

test('garbage is blocked', () => {
  for (const ip of ['', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', ':::1', 'g::1']) assert.equal(blockedIp(ip), true, ip);
});
