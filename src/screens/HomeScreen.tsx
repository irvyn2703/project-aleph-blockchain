import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getObraNombre } from '../db/queries';
import { runChatTurn, type HistoryTurn } from '../qvac/chat';
import { colors, radius } from '../theme';
import type { ChatMessage, ScreenName } from '../types';

function nid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function HomeScreen({
  qvacLabel,
  onOpen,
  refreshToken,
}: {
  qvacLabel: string;
  onOpen: (s: ScreenName) => void;
  refreshToken: number;
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
        onDelta: (chunk) => {
          setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: chunk } : x)));
        },
      });
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: out } : x)));
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: out },
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
    >
      <Text style={styles.kicker}>Asistente virtual con IA</Text>
      <Text style={styles.obra}>{obra}</Text>
      <Text style={styles.status}>{qvacLabel}</Text>

      <View style={styles.tiles}>
        <Pressable style={[styles.tile, styles.green]} onPress={() => onOpen('presupuestos')}>
          <Text style={styles.tileText}>Presupuestos</Text>
        </Pressable>
        <Pressable style={[styles.tile, styles.green]} onPress={() => onOpen('gastos')}>
          <Text style={styles.tileText}>Control de gastos</Text>
        </Pressable>
        <Pressable style={[styles.tile, styles.green]} onPress={() => onOpen('expediente')}>
          <Text style={styles.tileText}>Expediente</Text>
        </Pressable>
        <Pressable style={[styles.tile, styles.yellow]} disabled>
          <Text style={styles.tileTextDark}>Reportes</Text>
          <Text style={styles.soon}>próximamente</Text>
        </Pressable>
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
            <Text style={styles.bubbleText}>{item.content}</Text>
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
          <Pressable onPress={send} style={styles.send}>
            <Text style={styles.sendText}>Enviar</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 12 },
  kicker: { color: colors.muted, paddingHorizontal: 16, fontSize: 12, letterSpacing: 0.4 },
  obra: { color: colors.text, paddingHorizontal: 16, fontSize: 20, fontWeight: '700', marginTop: 2 },
  status: { color: colors.muted, paddingHorizontal: 16, fontSize: 12, marginTop: 4, marginBottom: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  tile: {
    width: '47.5%',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    minHeight: 64,
    justifyContent: 'center',
  },
  green: { backgroundColor: colors.green },
  yellow: { backgroundColor: colors.yellow, opacity: 0.85 },
  tileText: { color: colors.text, fontWeight: '700' },
  tileTextDark: { color: '#1A1404', fontWeight: '700' },
  soon: { color: '#1A1404', fontSize: 11, marginTop: 2 },
  chat: { flex: 1, marginTop: 12 },
  chatContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  bubble: { maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.userBubble },
  assistant: { alignSelf: 'flex-start', backgroundColor: colors.assistantBubble },
  bubbleText: { color: colors.text, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: { backgroundColor: colors.green, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  sendText: { color: colors.text, fontWeight: '700' },
});
