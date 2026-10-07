import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { FileUp, Trash } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { formatDay, formatDayKey } from '@moneylens/shared';
import type { ImportRecord, ImportStatus } from '@moneylens/types';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  Screen,
  Segmented,
  Tag,
  TextField,
} from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { useDeleteImport, useImportHistory } from '@/lib/queries';
import { colors, type } from '@/lib/theme';
import {
  KIND_LABEL,
  kindFromMime,
  kindFromName,
  nameFromUri,
  type StatementKind,
} from './incoming';
import { needsInput, uploadStatement, type NeedsInput, type PickedFile } from './upload';

const STATUS: Record<ImportStatus, { label: string; tone: 'good' | 'bad' | 'neutral' }> = {
  UPLOADED: { label: 'Uploaded', tone: 'neutral' },
  PARSING: { label: 'Processing', tone: 'neutral' },
  READY_FOR_REVIEW: { label: 'Needs review', tone: 'neutral' },
  CONFIRMED: { label: 'Imported', tone: 'good' },
  FAILED: { label: 'Could not read', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export function ImportsScreen() {
  const { incoming } = useLocalSearchParams<{ incoming?: string }>();
  const history = useImportHistory();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  /** A file shared from another app whose type could not be told from its name. */
  const [unknownKind, setUnknownKind] = useState<{ uri: string; name: string } | null>(null);
  const [pending, setPending] = useState<NeedsInput | null>(null);
  const [password, setPassword] = useState('');

  const upload = useMutation({
    mutationFn: ({ file, pdfPassword }: { file: PickedFile; pdfPassword?: string }) =>
      uploadStatement(file, pdfPassword),
    onSuccess: (review) => {
      setPicked(null);
      setPending(null);
      setPassword('');
      void history.refetch();
      router.push(`/imports/${review.import.id}`);
    },
    onError: (err) => setPending(needsInput(err)),
  });

  const start = (file: PickedFile) => {
    setPicked(file);
    setPending(null);
    upload.mutate({ file });
  };

  // A statement opened in MoneyLens from another app. Starting the upload is
  // the effect here; the state it sets only tracks that upload.
  useEffect(() => {
    if (!incoming) return;
    const name = nameFromUri(incoming);
    const kind = kindFromName(name);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (kind) start({ uri: incoming, name, kind });
    else setUnknownKind({ uri: incoming, name });
    /* eslint-enable react-hooks/set-state-in-effect */
    // Run once per incoming file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const choose = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Some Android file managers report CSV files as plain text.
        ...(Platform.OS === 'android' ? ['text/plain'] : []),
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const kind = kindFromName(asset.name) ?? kindFromMime(asset.mimeType);
    if (!kind) {
      setUnknownKind({ uri: asset.uri, name: asset.name });
      return;
    }
    start({ uri: asset.uri, name: asset.name, kind, ...(asset.file ? { file: asset.file } : {}) });
  };

  const duplicateId =
    upload.error instanceof ApiError && upload.error.code === 'CONFLICT'
      ? (upload.error.details?.importId as string | undefined)
      : undefined;

  return (
    <Screen edges={[]} refreshing={history.isRefetching} onRefresh={() => void history.refetch()}>
      <Card
        title="Import a statement"
        subtitle="Google Pay PDF, or a CSV or Excel (.xlsx) statement from your bank. You review every row before anything is saved."
      >
        <Button
          label={upload.isPending ? 'Reading your statement…' : 'Choose a file'}
          icon={<FileUp size={18} color="#fff" />}
          busy={upload.isPending}
          onPress={() => void choose()}
        />
        <Text style={[type.small, { marginTop: 10 }]}>
          The file is read once to find your transactions and is not stored. MoneyLens never asks
          for your UPI PIN or bank password.
        </Text>
      </Card>

      {unknownKind ? (
        <KindChooser
          name={unknownKind.name}
          onCancel={() => setUnknownKind(null)}
          onChoose={(kind) => {
            setUnknownKind(null);
            start({ uri: unknownKind.uri, name: unknownKind.name, kind });
          }}
        />
      ) : null}

      {picked &&
      pending &&
      (pending.reason === 'PASSWORD_REQUIRED' || pending.reason === 'PASSWORD_INCORRECT') ? (
        <Card title="This PDF is password protected">
          <Text style={[type.small, { marginBottom: 12 }]}>
            Enter the password for {picked.name}. MoneyLens uses it once to open the file and does
            not store it.
          </Text>
          <TextField
            label="PDF password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="off"
            value={password}
            onChangeText={setPassword}
            error={
              pending.reason === 'PASSWORD_INCORRECT'
                ? 'That password did not open the PDF. Check it and try again.'
                : undefined
            }
          />
          <Button
            label="Open PDF"
            style={{ marginTop: 12 }}
            disabled={!password}
            busy={upload.isPending}
            onPress={() => upload.mutate({ file: picked, pdfPassword: password })}
          />
        </Card>
      ) : null}

      {pending?.reason === 'COLUMNS_NOT_FOUND' ? (
        <Card title="We couldn't find the columns">
          <Text style={type.small}>
            {pending.message} Open MoneyLens on the web and upload this file there to match its date
            and amount columns; after that, review works here too.
          </Text>
        </Card>
      ) : null}

      {upload.isError && !pending ? (
        <Card>
          <Text accessibilityRole="alert" style={[type.body, { color: colors.negative }]}>
            {errorMessage(upload.error)}
          </Text>
          {duplicateId ? (
            <Button
              label="Open the earlier import"
              variant="secondary"
              style={{ marginTop: 12 }}
              onPress={() => router.push(`/imports/${duplicateId}`)}
            />
          ) : null}
        </Card>
      ) : null}

      <Text accessibilityRole="header" style={[type.heading, { marginTop: 8 }]}>
        Import history
      </Text>
      {history.isPending ? (
        <Loading />
      ) : history.isError ? (
        <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} />
      ) : history.data.length === 0 ? (
        <Text style={type.small}>Nothing imported yet.</Text>
      ) : (
        history.data.map((record) => <HistoryRow key={record.id} record={record} />)
      )}
    </Screen>
  );
}

function KindChooser({
  name,
  onChoose,
  onCancel,
}: {
  name: string;
  onChoose: (kind: StatementKind) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<StatementKind>('pdf');
  return (
    <Card title="What kind of file is this?" subtitle={name}>
      <Segmented
        label="File type"
        value={kind}
        onChange={setKind}
        options={(Object.keys(KIND_LABEL) as StatementKind[]).map((k) => ({
          value: k,
          label: KIND_LABEL[k],
        }))}
      />
      <Button label="Import" style={{ marginTop: 12 }} onPress={() => onChoose(kind)} />
      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </Card>
  );
}

function HistoryRow({ record }: { record: ImportRecord }) {
  const remove = useDeleteImport();
  const status = STATUS[record.status];
  const confirmDelete = () => {
    const committed = record.committedCount;
    Alert.alert(
      'Delete this import?',
      committed > 0
        ? `This also deletes the ${committed} transactions it added.`
        : 'Nothing from it has been saved yet.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(record.id) },
      ],
    );
  };
  const reviewable = record.status === 'READY_FOR_REVIEW';
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={reviewable ? 'Opens the review' : 'Opens the import'}
        onPress={() => router.push(`/imports/${record.id}`)}
      >
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '600', flex: 1 }]}>
            {record.filename}
          </Text>
          <Tag label={status.label} tone={status.tone} />
        </View>
        <Text style={[type.small, { marginTop: 4 }]}>
          Uploaded {formatDay(record.createdAt)}
          {record.statementStart && record.statementEnd
            ? ` · ${formatDayKey(record.statementStart)} to ${formatDayKey(record.statementEnd)}`
            : ''}
        </Text>
        <Text style={type.small}>
          {record.detectedCount} found · {record.duplicateCount} possible duplicates
          {record.status === 'CONFIRMED' ? ` · ${record.committedCount} imported` : ''}
        </Text>
        {record.errorMessage ? (
          <Text style={[type.small, { color: colors.negative }]}>{record.errorMessage}</Text>
        ) : null}
      </Pressable>
      <Button
        label="Delete"
        variant="ghost"
        icon={<Trash size={16} color={colors.primary} />}
        busy={remove.isPending}
        onPress={confirmDelete}
        accessibilityLabel={`Delete import ${record.filename}`}
        style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 0 }}
      />
    </Card>
  );
}
