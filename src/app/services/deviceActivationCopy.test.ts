import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const setup = readFileSync("src/app/pages/device/DeviceSetup.tsx", "utf8");

test("Device activation uses customer-facing Activation Key terminology in English and Turkish", () => {
  assert.doesNotMatch(setup, /Device provisioning|Secret Key|Gizli Anahtar/);
  assert.match(setup, /description: "Enter the Activation Key created by your cangujet administrator\."/);
  assert.match(setup, /label: "Activation Key"/);
  assert.match(setup, /description: "cangujet yöneticiniz tarafından oluşturulan Etkinleştirme Anahtarını girin\."/);
  assert.match(setup, /label: "Etkinleştirme Anahtarı"/);
  assert.equal((setup.match(/CANGUJET-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX/g) ?? []).length, 2);
});

test("activation controls and helper copy always follow the selected language", () => {
  assert.match(setup, /help: "Paste is supported\. The key is removed after activation\."/);
  assert.match(setup, /help: "Anahtarı yapıştırabilirsiniz\. Etkinleştirmeden sonra anahtar bu cihazdan kaldırılır\."/);
  assert.match(setup, /back: "Back"[\s\S]*activate: "Activate device"[\s\S]*retry: "Try again"/);
  assert.match(setup, /back: "Geri"[\s\S]*activate: "Cihazı etkinleştir"[\s\S]*retry: "Tekrar dene"/);
  assert.match(setup, /steps: \["Cihaz doğrulanıyor", "Şube ayarları yükleniyor", "Menü yükleniyor", "Çalışma alanı hazırlanıyor"\]/);
  assert.match(setup, /> \{text\.back\}<\/button>/);
  assert.match(setup, />\{text\.help\}<\/span>/);
  assert.match(setup, /error \? text\.retry : text\.activate/);
  assert.match(setup, /validationError \? text\.validation : error/);
  assert.match(setup, /steps=\{text\.steps\}/);
  assert.doesNotMatch(setup, /> Back<|>Verify key<|>Paste is supported\./);
});

test("reactivation copy remains localized and internal provisioning contracts are unchanged", () => {
  assert.match(setup, /This device needs to be reactivated\./);
  assert.match(setup, /Enter a new activation key to continue\./);
  assert.match(setup, /Bu cihazın yeniden etkinleştirilmesi gerekiyor\./);
  assert.match(setup, /Devam etmek için yeni bir etkinleştirme anahtarı girin\./);
  assert.match(setup, /isSupportedDeviceProvisioningKey/);
  assert.match(setup, /normalizeDeviceActivationKey/);
  assert.match(setup, /configureDevice\(secretKey\.trim\(\), deviceType\)/);
});
