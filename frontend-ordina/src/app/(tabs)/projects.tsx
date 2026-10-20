/**
 * ORDINA Projects List Screen
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useProjectsStore } from '@/store/projects-store';
import { href } from '@/utils/href';

export default function ProjectsScreen() {
  const theme = useTheme();
  const { projects, loadProjects } = useProjectsStore();

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Projects</ThemedText>
        <Pressable
          onPress={() => router.push(href('/new-project'))}
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
      >
        {projects.map((project) => {
          const progressWidth = `${project.progress}%`;
          return (
            <Pressable
              key={project.id}
              onPress={() => router.push(href(`/project/${project.id}`))}
              style={[styles.projectCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              {/* Icon + name */}
              <View style={styles.cardHeader}>
                <View style={[styles.projectIcon, { backgroundColor: project.color + '22' }]}>
                  <Ionicons name="briefcase-outline" size={20} color={project.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.projectName} numberOfLines={1}>
                    {project.name}
                  </ThemedText>
                  {project.subtitle && (
                    <ThemedText themeColor="textSecondary" style={styles.projectSubtitle} numberOfLines={1}>
                      {project.subtitle}
                    </ThemedText>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>

              {/* Progress bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressRow}>
                  <ThemedText themeColor="textSecondary" style={styles.progressLabel}>
                    PROGRESS
                  </ThemedText>
                  <ThemedText style={[styles.progressPct, { color: project.color }]}>
                    {project.progress}%
                  </ThemedText>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: progressWidth as any, backgroundColor: project.color },
                    ]}
                  />
                </View>
              </View>

              {/* Stats */}
              <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
                <View style={styles.stat}>
                  <ThemedText style={styles.statNum}>{project.tasksTotal}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.statLabel}>Tasks</ThemedText>
                </View>
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <View style={styles.stat}>
                  <ThemedText style={[styles.statNum, { color: theme.success }]}>
                    {project.tasksCompleted}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.statLabel}>Done</ThemedText>
                </View>
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <View style={styles.stat}>
                  <ThemedText style={[styles.statNum, { color: theme.danger }]}>
                    {project.tasksOverdue}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.statLabel}>Overdue</ThemedText>
                </View>
              </View>
            </Pressable>
          );
        })}

        {projects.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={48} color={theme.textSecondary} />
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No projects yet. Create your first project!
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontFamily: 'Poppins_600SemiBold' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 16 },
  projectCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  projectIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  projectSubtitle: { fontSize: 12 },
  progressSection: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 11, letterSpacing: 0.8 },
  progressPct: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  statLabel: { fontSize: 11 },
  statDivider: { width: 1, marginVertical: 4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
