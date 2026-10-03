import { Button, Link, Navbar, Page, Popup, Preloader, Sheet } from 'konsta/react'
import { useEffect, useState } from 'react'
import { cancelJoinRequest, createGroup, removeFriend, requestJoinGroup, respondFriendRequest, searchUsers, sendFriendRequest } from '../lib/api'
import type { Friendship, Group, Relation, UserSearchResult } from '../lib/types'
import { Avatar } from './Avatar'
import { IconCheck } from './icons'

const pill = 'shrink-0 rounded-full px-3 py-1.5 text-[14px] font-semibold disabled:opacity-40'

/** Search people by display name or exact email, send/accept requests, and manage friends. */
export function FriendsSheet({
  opened,
  friendships,
  onClose,
  onChanged,
}: {
  opened: boolean
  friendships: Friendship[]
  onClose: () => void
  onChanged: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      searchUsers(term)
        .then((r) => !cancelled && setResults(r))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Search failed'))
        .finally(() => !cancelled && setSearching(false))
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  async function act(userId: string, fn: () => Promise<unknown>, next?: Relation) {
    setBusyId(userId)
    setError(null)
    try {
      const out = await fn()
      const relation = (next ?? out) as Relation
      setResults((rs) => rs.map((r) => (r.user_id === userId ? { ...r, relation } : r)))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  const friends = friendships.filter((f) => f.status === 'accepted')
  const incoming = friendships.filter((f) => f.status === 'pending' && f.incoming)
  const outgoing = friendships.filter((f) => f.status === 'pending' && !f.incoming)

  function Row({ id, name, avatar, right }: { id: string; name: string; avatar: string | null; right: React.ReactNode }) {
    return (
      <li key={id} className="flex items-center gap-3 px-4 py-3">
        <Avatar url={avatar} name={name} size={40} />
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{name}</span>
        {right}
      </li>
    )
  }

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar title="Friends" right={<Link onClick={onClose}>Done</Link>} />
        <div className="space-y-5 px-4 py-4 pb-16">
          <div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or exact email"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-xl bg-card px-4 py-3.5 text-[17px] outline-none placeholder:text-muted focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1.5 px-1 text-[12px] text-muted">
              Friends see each other's progress, just like in a group. They accept your request first.
            </p>
          </div>

          {error && <p className="text-center text-sm text-move">{error}</p>}

          {q.trim().length >= 2 && (
            <section>
              <h3 className="mb-2 px-1 text-[13px] font-medium tracking-wide text-muted uppercase">Results</h3>
              {searching && results.length === 0 ? (
                <div className="flex justify-center py-4">
                  <Preloader />
                </div>
              ) : results.length === 0 ? (
                <p className="rounded-2xl bg-card px-4 py-4 text-center text-[15px] text-muted">No one found.</p>
              ) : (
                <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
                  {results.map((r) => (
                    <Row
                      key={r.user_id}
                      id={r.user_id}
                      name={r.display_name}
                      avatar={r.avatar_url}
                      right={
                        r.relation === 'friends' ? (
                          <span className="flex items-center gap-1 text-[14px] text-exercise">
                            <IconCheck size={16} /> Friends
                          </span>
                        ) : r.relation === 'requested' ? (
                          <span className="text-[14px] text-muted">Requested</span>
                        ) : r.relation === 'incoming' ? (
                          <button
                            type="button"
                            disabled={busyId === r.user_id}
                            onClick={() => act(r.user_id, () => respondFriendRequest(r.user_id, true), 'friends')}
                            className={`${pill} bg-primary text-black`}
                          >
                            Accept
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === r.user_id}
                            onClick={() => act(r.user_id, () => sendFriendRequest(r.user_id))}
                            className={`${pill} bg-primary text-black`}
                          >
                            Add
                          </button>
                        )
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {incoming.length > 0 && (
            <section>
              <h3 className="mb-2 px-1 text-[13px] font-medium tracking-wide text-muted uppercase">Requests for you</h3>
              <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
                {incoming.map((f) => (
                  <Row
                    key={f.user_id}
                    id={f.user_id}
                    name={f.display_name}
                    avatar={f.avatar_url}
                    right={
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={busyId === f.user_id}
                          onClick={() => act(f.user_id, () => respondFriendRequest(f.user_id, false), 'none')}
                          className={`${pill} text-muted`}
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={busyId === f.user_id}
                          onClick={() => act(f.user_id, () => respondFriendRequest(f.user_id, true), 'friends')}
                          className={`${pill} bg-primary text-black`}
                        >
                          Accept
                        </button>
                      </div>
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 px-1 text-[13px] font-medium tracking-wide text-muted uppercase">
              Your friends {friends.length > 0 && `(${friends.length})`}
            </h3>
            {friends.length === 0 && outgoing.length === 0 ? (
              <p className="rounded-2xl bg-card px-4 py-4 text-center text-[15px] text-muted">
                No friends yet. Search above to add someone from another group.
              </p>
            ) : (
              <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
                {friends.map((f) => (
                  <Row
                    key={f.user_id}
                    id={f.user_id}
                    name={f.display_name}
                    avatar={f.avatar_url}
                    right={
                      <button
                        type="button"
                        disabled={busyId === f.user_id}
                        onClick={() => act(f.user_id, () => removeFriend(f.user_id), 'none')}
                        className={`${pill} text-move`}
                      >
                        Remove
                      </button>
                    }
                  />
                ))}
                {outgoing.map((f) => (
                  <Row
                    key={f.user_id}
                    id={f.user_id}
                    name={f.display_name}
                    avatar={f.avatar_url}
                    right={
                      <button
                        type="button"
                        disabled={busyId === f.user_id}
                        onClick={() => act(f.user_id, () => removeFriend(f.user_id), 'none')}
                        className={`${pill} text-muted`}
                      >
                        Cancel request
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </Page>
    </Popup>
  )
}

/** Admin-only: create a new group that new sign-ups can choose. */
export function NewGroupSheet({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await createGroup(name)
      setName('')
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the group'
      setError(/duplicate|unique/i.test(msg) ? 'A group with that name already exists.' : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="rounded-t-3xl bg-card!">
      <form
        className="pb-safe space-y-4 px-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save()
        }}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
        <div>
          <h2 className="text-[22px] font-bold">New group</h2>
          <p className="text-[14px] text-muted">New sign-ups will be able to pick it.</p>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="Group name"
          className="w-full rounded-xl bg-card-2 px-4 py-3.5 text-[17px] outline-none placeholder:text-muted focus:ring-2 focus:ring-primary"
        />
        {error && <p className="text-center text-sm text-move">{error}</p>}
        <Button large rounded type="submit" disabled={busy || !name.trim()} className="font-semibold text-black">
          {busy ? <Preloader className="h-5! w-5!" /> : 'Create group'}
        </Button>
      </form>
    </Sheet>
  )
}

/** For people who aren't in any group yet: ask to join (an admin approves). */
export function JoinGroupSheet({
  opened,
  groups,
  onClose,
  onJoined,
}: {
  opened: boolean
  groups: Group[]
  onClose: () => void
  onJoined: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(g: Group) {
    setBusyId(g.id)
    setError(null)
    try {
      if (g.requested) await cancelJoinRequest(g.id)
      else await requestJoinGroup(g.id)
      onJoined()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="rounded-t-3xl bg-card!">
      <div className="pb-safe space-y-4 px-4 pt-3">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
        <div>
          <h2 className="text-[22px] font-bold">Join a group</h2>
          <p className="text-[14px] text-muted">Adwait approves new members. You'll see the group once you're in.</p>
        </div>
        {error && <p className="text-center text-sm text-move">{error}</p>}
        <div className="space-y-2">
          {groups
            .filter((g) => !g.is_member)
            .map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={busyId !== null}
                onClick={() => toggle(g)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card-2 p-4 text-left active:bg-white/10"
              >
                <span className="text-[22px]">👥</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-semibold">{g.name}</div>
                  <div className="text-[13px] text-muted">
                    {g.requested ? 'Waiting for approval · tap to cancel' : `${g.member_count} member${g.member_count === 1 ? '' : 's'}`}
                  </div>
                </div>
                {busyId === g.id ? (
                  <Preloader className="h-5! w-5!" />
                ) : g.requested ? (
                  <span className="text-muted">Requested</span>
                ) : (
                  <span className="text-primary">Request</span>
                )}
              </button>
            ))}
        </div>
      </div>
    </Sheet>
  )
}
