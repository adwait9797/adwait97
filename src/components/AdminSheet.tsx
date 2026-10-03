import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Dialog, DialogButton, Link, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useCallback, useEffect, useState } from 'react'
import {
  adminAddMember,
  adminRemoveMember,
  adminReviewRequest,
  adminUsers,
  deleteGroup,
  listGroups,
  renameGroup,
} from '../lib/api'
import { timeAgo } from '../lib/dates'
import type { AdminUser, Group } from '../lib/types'
import { Avatar } from './Avatar'
import { NewGroupSheet } from './FriendsSheets'

const pill = 'shrink-0 rounded-full px-3 py-1.5 text-[14px] font-semibold disabled:opacity-40'
const sectionTitle = 'mb-2 px-1 text-[13px] font-medium tracking-wide text-muted uppercase'

/** Admin-only overview: join requests, members per group, people without a group. */
export function AdminSheet({ opened, onClose, onChanged }: { opened: boolean; onClose: () => void; onChanged: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState(false)
  const [addTo, setAddTo] = useState<Group | null>(null) // pick people to add to this group
  const [placeUser, setPlaceUser] = useState<AdminUser | null>(null) // pick a group for this person
  const [groupMenu, setGroupMenu] = useState<Group | null>(null)
  const [renaming, setRenaming] = useState<{ group: Group; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)

  const load = useCallback(async () => {
    try {
      const [u, g] = await Promise.all([adminUsers(), listGroups()])
      setUsers(u)
      setGroups(g)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load')
    }
  }, [])

  useEffect(() => {
    if (opened) load()
  }, [opened, load])

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? 'a group'
  const requests = (users ?? [])
    .flatMap((u) => u.requested_group_ids.map((gid) => ({ user: u, groupId: gid })))
    .sort((a, b) => (a.user.requested_at ?? '').localeCompare(b.user.requested_at ?? ''))
  const noGroup = (users ?? []).filter((u) => u.group_ids.length === 0 && u.requested_group_ids.length === 0)

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar title="Admin" right={<Link onClick={onClose}>Done</Link>} />
        {!users ? (
          <div className="flex justify-center pt-20">{error ? <p className="px-8 text-center text-move">{error}</p> : <Preloader />}</div>
        ) : (
          <div className="space-y-6 px-4 py-4 pb-16">
            {error && <p className="rounded-xl bg-move/15 px-3 py-2 text-center text-sm text-move">{error}</p>}

            <div className="grid grid-cols-3 gap-2">
              <Stat label="People" value={users.length} />
              <Stat label="Groups" value={groups.length} />
              <Stat label="Requests" value={requests.length} highlight={requests.length > 0} />
            </div>

            {/* Join requests */}
            <section>
              <h3 className={sectionTitle}>Join requests</h3>
              {requests.length === 0 ? (
                <p className="rounded-2xl bg-card px-4 py-4 text-center text-[15px] text-muted">No pending requests.</p>
              ) : (
                <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
                  {requests.map(({ user, groupId }) => {
                    const key = `${groupId}:${user.user_id}`
                    return (
                      <li key={key} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar url={user.avatar_url} name={user.display_name} size={40} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[16px] font-semibold">{user.display_name}</div>
                            <div className="text-[13px] text-muted">
                              wants to join <b className="text-white">{groupName(groupId)}</b>
                              {user.requested_at && ` · ${timeAgo(user.requested_at)}`}
                            </div>
                            <div className="truncate text-[12px] text-muted">{user.email}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => run(key, () => adminReviewRequest(groupId, user.user_id, false))}
                            className={`${pill} bg-white/10 text-white`}
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => run(key, () => adminReviewRequest(groupId, user.user_id, true))}
                            className={`${pill} bg-primary px-5 text-black`}
                          >
                            {busy === key ? '…' : 'Approve'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Groups and their members */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-[13px] font-medium tracking-wide text-muted uppercase">Groups</h3>
                <button type="button" onClick={() => setNewGroup(true)} className="text-[14px] font-semibold text-primary">
                  + New group
                </button>
              </div>
              {groups.map((g) => {
                const members = users.filter((u) => u.group_ids.includes(g.id))
                return (
                  <div key={g.id} className="overflow-hidden rounded-2xl bg-card">
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-[17px] font-bold">👥 {g.name}</span>
                      <span className="text-[13px] text-muted">{members.length}</span>
                      <button
                        type="button"
                        aria-label={`Manage ${g.name}`}
                        onClick={() => setGroupMenu(g)}
                        className="rounded-full px-2 text-[20px] leading-none text-muted active:bg-white/10"
                      >
                        ⋯
                      </button>
                    </div>
                    <ul className="divide-y divide-white/10">
                      {members.length === 0 && <li className="px-4 py-3 text-[14px] text-muted">No members yet.</li>}
                      {members.map((u) => {
                        const key = `rm:${g.id}:${u.user_id}`
                        return (
                          <li key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
                            <Avatar url={u.avatar_url} name={u.display_name} size={34} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[15px] font-semibold">{u.display_name}</div>
                              <div className="truncate text-[12px] text-muted">{u.email}</div>
                            </div>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => run(key, () => adminRemoveMember(g.id, u.user_id))}
                              className={`${pill} text-move`}
                            >
                              {busy === key ? '…' : 'Remove'}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setAddTo(g)}
                      className="w-full border-t border-white/10 py-3 text-[15px] font-semibold text-primary active:bg-white/5"
                    >
                      + Add people
                    </button>
                  </div>
                )
              })}
            </section>

            {/* People without a group */}
            <section>
              <h3 className={sectionTitle}>No group ({noGroup.length})</h3>
              {noGroup.length === 0 ? (
                <p className="rounded-2xl bg-card px-4 py-4 text-center text-[15px] text-muted">Everyone is in a group.</p>
              ) : (
                <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
                  {noGroup.map((u) => (
                    <li key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar url={u.avatar_url} name={u.display_name} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold">{u.display_name}</div>
                        <div className="truncate text-[12px] text-muted">
                          {u.email} · joined {timeAgo(u.joined_at)}
                        </div>
                      </div>
                      <button type="button" onClick={() => setPlaceUser(u)} className={`${pill} bg-white/10`}>
                        Add to group
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* Pick people to add to a group */}
        <Popup opened={!!addTo} onBackdropClick={() => setAddTo(null)}>
          <Page>
            <Navbar title={addTo ? `Add to ${addTo.name}` : ''} right={<Link onClick={() => setAddTo(null)}>Done</Link>} />
            <ul className="mx-4 my-4 divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
              {addTo &&
                (users ?? [])
                  .filter((u) => !u.group_ids.includes(addTo.id))
                  .map((u) => {
                    const key = `add:${addTo.id}:${u.user_id}`
                    return (
                      <li key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
                        <Avatar url={u.avatar_url} name={u.display_name} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-semibold">{u.display_name}</div>
                          <div className="truncate text-[12px] text-muted">
                            {u.group_ids.length ? `in ${u.group_ids.map(groupName).join(', ')}` : 'no group'}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => run(key, () => adminAddMember(addTo.id, u.user_id))}
                          className={`${pill} bg-primary text-black`}
                        >
                          {busy === key ? '…' : 'Add'}
                        </button>
                      </li>
                    )
                  })}
              {addTo && (users ?? []).every((u) => u.group_ids.includes(addTo.id)) && (
                <li className="px-4 py-4 text-center text-[15px] text-muted">Everyone is already in this group.</li>
              )}
            </ul>
          </Page>
        </Popup>

        {/* Choose a group for one person */}
        <Actions opened={!!placeUser} onBackdropClick={() => setPlaceUser(null)}>
          <ActionsGroup>
            <ActionsLabel>Add {placeUser?.display_name} to…</ActionsLabel>
            {groups.map((g) => (
              <ActionsButton
                key={g.id}
                onClick={() => {
                  const u = placeUser
                  setPlaceUser(null)
                  if (u) run(`place:${u.user_id}`, () => adminAddMember(g.id, u.user_id))
                }}
              >
                {g.name}
              </ActionsButton>
            ))}
          </ActionsGroup>
          <ActionsGroup>
            <ActionsButton onClick={() => setPlaceUser(null)}>Cancel</ActionsButton>
          </ActionsGroup>
        </Actions>

        {/* Rename / delete a group */}
        <Actions opened={!!groupMenu} onBackdropClick={() => setGroupMenu(null)}>
          <ActionsGroup>
            <ActionsLabel>{groupMenu?.name}</ActionsLabel>
            <ActionsButton
              onClick={() => {
                const g = groupMenu
                setGroupMenu(null)
                if (g) setRenaming({ group: g, name: g.name })
              }}
            >
              Rename
            </ActionsButton>
            <ActionsButton
              className="text-move!"
              onClick={() => {
                const g = groupMenu
                setGroupMenu(null)
                setDeleting(g)
              }}
            >
              Delete group
            </ActionsButton>
          </ActionsGroup>
          <ActionsGroup>
            <ActionsButton onClick={() => setGroupMenu(null)}>Cancel</ActionsButton>
          </ActionsGroup>
        </Actions>

        <Dialog
          opened={!!renaming}
          onBackdropClick={() => setRenaming(null)}
          title="Rename group"
          content={
            <input
              value={renaming?.name ?? ''}
              onChange={(e) => renaming && setRenaming({ ...renaming, name: e.target.value.slice(0, 40) })}
              className="mt-2 w-full rounded-lg bg-white/10 px-3 py-2 text-[16px] text-white outline-none"
            />
          }
          buttons={
            <>
              <DialogButton onClick={() => setRenaming(null)}>Cancel</DialogButton>
              <DialogButton
                strong
                onClick={() => {
                  const r = renaming
                  setRenaming(null)
                  if (r && r.name.trim() && r.name.trim() !== r.group.name) run(`rename:${r.group.id}`, () => renameGroup(r.group.id, r.name))
                }}
              >
                Save
              </DialogButton>
            </>
          }
        />

        <Dialog
          opened={!!deleting}
          onBackdropClick={() => setDeleting(null)}
          title={`Delete ${deleting?.name ?? 'group'}?`}
          content="Members are taken out of the group and pending requests are cleared. Their own workouts and meals are not affected."
          buttons={
            <>
              <DialogButton onClick={() => setDeleting(null)}>Cancel</DialogButton>
              <DialogButton
                strong
                className="text-move!"
                onClick={() => {
                  const g = deleting
                  setDeleting(null)
                  if (g) run(`delete:${g.id}`, () => deleteGroup(g.id))
                }}
              >
                Delete
              </DialogButton>
            </>
          }
        />

        <NewGroupSheet
          opened={newGroup}
          onClose={() => setNewGroup(false)}
          onCreated={() => {
            load()
            onChanged()
          }}
        />
      </Page>
    </Popup>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-2.5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`num text-[24px] font-bold ${highlight ? 'text-move' : ''}`}>{value}</div>
    </div>
  )
}
