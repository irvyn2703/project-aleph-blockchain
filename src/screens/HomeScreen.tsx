import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getObraNombre } from '../db/queries';
import { runChatTurn, type HistoryTurn } from '../qvac/chat';
import { colors, layout, radius } from '../theme';
import type { ChatMessage, ScreenName } from '../types';

function nid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function HomeScreen({
  mode,
  qvacLabel,
  onOpen,
  refreshToken,
  keyboardHeight = 0,
}: {
  mode: 'home' | 'assistant';
  qvacLabel: string;
  onOpen: (s: ScreenName) => void;
  refreshToken: number;
  keyboardHeight?: number;
}) {
  const [obra, setObra] = useState('Obra');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'hello',
      role: 'assistant',
      content:
        'Todavía no hay datos de demo. Importá tu Excel en Presupuestos y tus gastos en Control de gastos.',
    },
  ]);
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<HistoryTurn[]>([]);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    void getObraNombre().then(setObra);
  }, [refreshToken]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const user: ChatMessage = { id: nid(), role: 'user', content: text };
    const assistantId = nid();
    setMessages((m) => [...m, user, { id: assistantId, role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      const out = await runChatTurn({
        history: historyRef.current,
        userText: text,
        // `onDelta` ya trae el texto acumulado del turno, no solo el último
        // fragmento: se asigna tal cual para que el mensaje crezca en pantalla.
        onDelta: (parcial) => {
          setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: parcial } : x)));
        },
        onProgress: (_kind, pct, label) => {
          setMessages((m) =>
            m.map((x) =>
              x.id === assistantId ? { ...x, content: pct == null ? label : `${label} ${pct}%` } : x
            )
          );
        },
      });
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId
            ? { ...x, content: out.text, fuente: out.fuente, toolCalls: out.toolCalls }
            : x
        )
      );
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: out.text },
      ].slice(-12) as HistoryTurn[];
    } catch (e) {
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId ? { ...x, content: `Error: ${e instanceof Error ? e.message : String(e)}` } : x
        )
      );
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'home') {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.homeContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>BUEN DÍA</Text>
        <Text style={styles.pageTitle}>Tu obra, bajo control</Text>
        <Text style={styles.pageSubtitle}>Documentos, evidencias y respuestas disponibles sin conexión.</Text>

        <View style={styles.projectCard}>
          <View style={styles.projectTop}>
            <Text style={styles.projectEyebrow}>OBRA ACTIVA</Text>
            <View style={styles.localPill}>
              <View style={styles.whiteDot} />
              <Text style={styles.localText}>LOCAL</Text>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.projectName}>{obra}</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressValue} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.projectMeta}>Avance documentado</Text>
            <Text style={styles.projectPercent}>64%</Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Acceso rápido</Text>
          <Text style={styles.sectionAction}>Todo local</Text>
        </View>
        <View style={styles.quickGrid}>
          <Pressable style={styles.quickCard} onPress={() => onOpen('gastos')}>
            <Text style={styles.quickIcon}>▣</Text>
            <Text style={styles.quickTitle}>Capturar</Text>
            <Text style={styles.quickMeta}>Foto u OCR</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => onOpen('expediente')}>
            <Text style={styles.quickIcon}>▤</Text>
            <Text style={styles.quickTitle}>Expediente</Text>
            <Text style={styles.quickMeta}>Archivos locales</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => onOpen('assistant')}>
            <Text style={styles.quickIcon}>✦</Text>
            <Text style={styles.quickTitle}>Consultar</Text>
            <Text style={styles.quickMeta}>IA local</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Requiere atención</Text>
          <Text style={styles.sectionAction}>Estado local</Text>
        </View>
        <Pressable style={styles.alertCard} onPress={() => onOpen('presupuestos')}>
          <View style={styles.alertDot} />
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>Presupuesto de la obra</Text>
            <Text numberOfLines={2} style={styles.alertMeta}>{qvacLabel}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 56 : 0 }]}>
      <View style={styles.assistantIntro}>
        <Text style={styles.kicker}>ASISTENTE PRIVADO</Text>
        <Text style={styles.pageTitle}>Pregunta a tu obra</Text>
        <Text style={styles.pageSubtitle}>Las respuestas se construyen con la evidencia disponible en el expediente.</Text>
      </View>

      <FlatList
        ref={listRef}
        style={styles.chat}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.assistant]}>
            <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>{item.content}</Text>
            {item.role === 'assistant' && item.fuente ? (
              <Text style={styles.fuente}>
                {item.fuente === 'sql'
                  ? 'Fuente: SQLite'
                  : item.toolCalls?.length
                    ? `IA local · ${item.toolCalls.join(', ')}`
                    : 'IA local'}
              </Text>
            ) : null}
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Preguntá sobre esta obra…"
          placeholderTextColor={colors.muted}
          editable={!busy}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        {busy ? <ActivityIndicator color={colors.green} /> : (
          <Pressable accessibilityLabel="Enviar pregunta" onPress={send} style={styles.send}>
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  homeContent: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.pagePadding,
    paddingTop: 28,
    paddingBottom: 28,
  },
  assistantIntro: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.pagePadding,
    paddingTop: 28,
  },
  kicker: { color: colors.greenDark, fontSize: 12, fontWeight: '800', letterSpacing: 2.1 },
  pageTitle: { color: colors.text, fontSize: 30, lineHeight: 36, letterSpacing: -1.1, fontWeight: '700', marginTop: 12 },
  pageSubtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 4, maxWidth: 520 },
  projectCard: {
    backgroundColor: colors.greenDark,
    borderRadius: radius.lg,
    padding: 20,
    marginTop: 24,
  },
  projectTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  projectEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 12, letterSpacing: 0.4 },
  localPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  whiteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  localText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  projectName: { color: colors.white, fontSize: 22, lineHeight: 28, fontWeight: '700', marginTop: 9 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 22, backgroundColor: 'rgba(255,255,255,0.23)', overflow: 'hidden' },
  progressValue: { width: '64%', height: '100%', borderRadius: 3, backgroundColor: '#DDF3B8' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  projectMeta: { color: 'rgba(255,255,255,0.72)', fontSize: 12 },
  projectPercent: { color: colors.white, fontSize: 12, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionAction: { color: colors.greenDark, fontSize: 12, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    justifyContent: 'flex-end',
    backgroundColor: colors.bg,
  },
  quickIcon: { color: colors.text, fontSize: 20, position: 'absolute', top: 14, left: 14 },
  quickTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
  quickMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  alertCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#ECDCB9',
    backgroundColor: colors.yellowDim,
    padding: 16,
  },
  alertDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.yellow, marginRight: 13 },
  alertCopy: { flex: 1 },
  alertTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  alertMeta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  chevron: { color: colors.muted, fontSize: 22 },
  chat: { flex: 1, marginTop: 14 },
  chatContent: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.pagePadding,
    paddingBottom: 10,
    gap: 12,
  },
  bubble: { maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.userBubble },
  assistant: { alignSelf: 'flex-start', backgroundColor: colors.assistantBubble, borderTopLeftRadius: 6 },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  fuente: { color: colors.muted, fontSize: 11, marginTop: 6 },
  userBubbleText: { color: colors.white },
  inputRow: {
    width: 'auto',
    maxWidth: layout.maxWidth - layout.pagePadding * 2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.pagePadding,
    marginBottom: 12,
    paddingLeft: 16,
    paddingRight: 7,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 9,
  },
  send: { width: 40, height: 40, backgroundColor: colors.green, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: colors.white, fontSize: 21, lineHeight: 23, fontWeight: '500', marginTop: -2 },
});
