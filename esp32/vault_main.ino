#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <HTTPClient.h>
#include <Preferences.h>

char auth[] = "ev4hJW8ktdkDEfkJaGqIN5dwBa7xsk2D";
char ssid[] = "ESP32_TEST";
char pass[] = "87654321";
const char* backendURL = "http://192.168.1.105:3000/api/access";
const char* BLYNK_TEMPLATE_ID = "TMPL3-47uwEca";
const char* BLYNK_TEMPLATE_NAME = "Upside Desk";

#define TOUCH_1 13
#define TOUCH_2 14
#define TOUCH_3 15
#define RELAY_PIN 23
#define BUZZER_PIN 22
#define RED_LED 25
#define GREEN_LED 26
#define YELLOW_LED 27
#define LED_ON LOW
#define LED_OFF HIGH

Preferences prefs;
int tries = 3;
bool locked = false;
unsigned long lockStart = 0;
#define LOCK_TIME 5000

bool sequence[3][3];
int seqStep = 0;
unsigned long lastStepTime = 0;
#define STEP_TIMEOUT 3000

void loadDefaultSequence() {
  sequence[0][0] = true;
  sequence[0][1] = false;
  sequence[0][2] = true;

  sequence[1][0] = false;
  sequence[1][1] = true;
  sequence[1][2] = false;

  sequence[2][0] = true;
  sequence[2][1] = true;
  sequence[2][2] = false;
}

void parseSequence(String s) {
  int firstDash = s.indexOf('-');
  int secondDash = s.indexOf('-', firstDash + 1);

  if (firstDash < 0 || secondDash < 0 || s.indexOf('-', secondDash + 1) >= 0) {
    loadDefaultSequence();
    return;
  }

  String parts[3];
  parts[0] = s.substring(0, firstDash);
  parts[1] = s.substring(firstDash + 1, secondDash);
  parts[2] = s.substring(secondDash + 1);

  for (int i = 0; i < 3; i++) {
    if (parts[i].length() != 3) {
      loadDefaultSequence();
      return;
    }
    for (int j = 0; j < 3; j++) {
      char c = parts[i][j];
      if (c != '0' && c != '1') {
        loadDefaultSequence();
        return;
      }
    }
  }

  for (int i = 0; i < 3; i++) {
    sequence[i][0] = parts[i][0] == '1';
    sequence[i][1] = parts[i][1] == '1';
    sequence[i][2] = parts[i][2] == '1';
  }
}

void setLEDs(bool r, bool g, bool y) {
  digitalWrite(RED_LED, r ? LED_ON : LED_OFF);
  digitalWrite(GREEN_LED, g ? LED_ON : LED_OFF);
  digitalWrite(YELLOW_LED, y ? LED_ON : LED_OFF);
}

void allOff() {
  setLEDs(false, false, false);
}

void beepGrant() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);
}

void beepDeny() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(100);
    digitalWrite(BUZZER_PIN, LOW);
    delay(80);
  }
}

void postToBackend(String status, String flag) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(backendURL);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"status\":\"" + status + "\",\"flag\":\"" + flag + "\"}";
  int code = http.POST(body);
  Serial.printf("Backend response code: %d\n", code);
  http.end();
}

BLYNK_WRITE(V2) {
  String newSeq = param.asStr();
  newSeq.replace("%2D", "-");
  newSeq.replace("%2d", "-");

  int dashCount = 0;
  for (int i = 0; i < newSeq.length(); i++) {
    if (newSeq[i] == '-') dashCount++;
  }

  if (dashCount == 2 && newSeq.length() == 11) {
    parseSequence(newSeq);
    prefs.putString("sequence", newSeq);
    Serial.println("NEW SEQUENCE SAVED");
    Blynk.virtualWrite(V0, "SEQUENCE UPDATED");
  } else {
    Serial.println("INVALID SEQUENCE REJECTED");
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(TOUCH_1, INPUT);
  pinMode(TOUCH_2, INPUT);
  pinMode(TOUCH_3, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);

  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  allOff();

  prefs.begin("vault", false);
  String stored = prefs.getString("sequence", "");
  if (stored.length() == 0) {
    parseSequence("101-010-110");
  } else {
    parseSequence(stored);
  }

  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi Connected: ");
  Serial.println(WiFi.localIP());

  Blynk.begin(auth, ssid, pass);
  Serial.println("READY");
}

void loop() {
  Blynk.run();

  if (seqStep > 0 && millis() - lastStepTime > STEP_TIMEOUT) {
    seqStep = 0;
    Serial.println("STEP TIMEOUT reset");
  }

  if (locked) {
    if (millis() - lockStart > LOCK_TIME) {
      locked = false;
      tries = 3;
      allOff();
      Serial.println("UNLOCKED");
    }
    return;
  }

  bool t1 = digitalRead(TOUCH_1);
  bool t2 = digitalRead(TOUCH_2);
  bool t3 = digitalRead(TOUCH_3);

  if (!t1 && !t2 && !t3) return;

  setLEDs(false, false, true);

  bool t1Expected = sequence[seqStep][0];
  bool t2Expected = sequence[seqStep][1];
  bool t3Expected = sequence[seqStep][2];

  if (t1 == t1Expected && t2 == t2Expected && t3 == t3Expected) {
    seqStep++;
    lastStepTime = millis();
    Serial.printf("SEQ STEP %d/3 MATCHED\n", seqStep);

    setLEDs(false, false, true);
    delay(200);
    allOff();

    if (seqStep == 3) {
      seqStep = 0;
      Serial.println("ACCESS GRANTED");
      Blynk.virtualWrite(V0, "ACCESS GRANTED");
      Blynk.virtualWrite(V1, 0);
      Blynk.logEvent("log_event", "ACCESS GRANTED");
      postToBackend("ACCESS GRANTED", "0");
      digitalWrite(RELAY_PIN, HIGH);
      setLEDs(false, true, false);
      beepGrant();
      delay(3000);
      digitalWrite(RELAY_PIN, LOW);
      allOff();
      tries = 3;
    }
  } else {
    seqStep = 0;
    tries--;
    Serial.printf("ACCESS DENIED tries left %d\n", tries);
    Blynk.virtualWrite(V0, "ACCESS DENIED");
    Blynk.virtualWrite(V1, 1);
    Blynk.logEvent("log_event", "ACCESS DENIED");
    postToBackend("ACCESS DENIED", "1");
    setLEDs(true, false, false);
    beepDeny();
    delay(1500);
    allOff();

    if (tries == 0) {
      Serial.println("LOCKED 5s");
      Blynk.virtualWrite(V0, "LOCKED");
      Blynk.virtualWrite(V1, 1);
      Blynk.logEvent("log_event", "LOCKED");
      postToBackend("LOCKED", "1");
      locked = true;
      lockStart = millis();
      setLEDs(true, true, true);
    }
  }

  while (digitalRead(TOUCH_1) || digitalRead(TOUCH_2) || digitalRead(TOUCH_3)) {
    delay(20);
  }

  Serial.println("LOOP END");
}
