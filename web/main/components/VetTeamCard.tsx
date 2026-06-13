import { Mail, Pencil, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { VetTeamMember } from "@/types/api.ts";
import {
	useAddVetTeamMember,
	useRemoveVetTeamMember,
	useUpdateVetTeamMember,
	useVetTeam,
} from "../lib/queries.ts";

// Teal accent, same family as the case-file "Dieta" stripe — the vet team reads
// as another section of the pet's reference chart.
const ACCENT = "#0f766e";

// The pet's care team — a roster of the vets/specialists on the case. Lives on
// the Pet page beside the case file (reference data, not a timeline event). The
// agent can also manage it via the vet_team_* tools.
export function VetTeamCard() {
	const { data: team, isLoading } = useVetTeam();
	const [adding, setAdding] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const isEmpty = !team || team.length === 0;

	return (
		<div className="bg-card surface p-5 sm:p-6">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="text-xs uppercase tracking-[0.14em] text-[#b88858] font-bold">
					Vet team
				</div>
				{!adding ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							setEditingId(null);
							setAdding(true);
						}}
						className="h-7 gap-1.5 text-xs"
					>
						<Plus className="w-3 h-3" /> Add
					</Button>
				) : null}
			</div>

			{adding ? <MemberForm onClose={() => setAdding(false)} /> : null}

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : isEmpty ? (
				!adding ? (
					<p className="text-sm text-foreground/70 leading-relaxed">
						The vets and specialists on the case — name, specialty, clinic, and
						contact. Hit <strong>Add</strong> to start the roster, or just tell
						the agent "add Dr. X, endocrinologista".
					</p>
				) : null
			) : (
				<ul className="space-y-3">
					{team?.map((m) =>
						editingId === m.id ? (
							<li key={m.id}>
								<MemberForm member={m} onClose={() => setEditingId(null)} />
							</li>
						) : (
							<MemberRow
								key={m.id}
								member={m}
								onEdit={() => {
									setAdding(false);
									setEditingId(m.id);
								}}
							/>
						),
					)}
				</ul>
			)}
		</div>
	);
}

function MemberRow({
	member,
	onEdit,
}: {
	member: VetTeamMember;
	onEdit: () => void;
}) {
	return (
		<li
			className="pl-3 border-l-[3px] flex items-start justify-between gap-2"
			style={{ borderColor: ACCENT, opacity: member.active ? 1 : 0.55 }}
		>
			<div className="min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-semibold text-sm text-foreground">
						{member.name}
					</span>
					{member.role ? (
						<span
							className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
							style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT }}
						>
							{member.role}
						</span>
					) : null}
					{!member.active ? (
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							inativo
						</span>
					) : null}
				</div>
				{member.clinic ? (
					<div className="text-sm text-foreground/80 leading-snug">
						{member.clinic}
					</div>
				) : null}
				{member.phone || member.email ? (
					<div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
						{member.phone ? (
							<a
								href={`tel:${member.phone}`}
								className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								<Phone className="w-3 h-3" /> {member.phone}
							</a>
						) : null}
						{member.email ? (
							<a
								href={`mailto:${member.email}`}
								className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								<Mail className="w-3 h-3" /> {member.email}
							</a>
						) : null}
					</div>
				) : null}
				{member.notes ? (
					<p className="text-xs text-muted-foreground mt-1 leading-snug">
						{member.notes}
					</p>
				) : null}
			</div>
			<button
				type="button"
				onClick={onEdit}
				aria-label={`Edit ${member.name}`}
				className="shrink-0 w-7 h-7 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
			>
				<Pencil className="w-3.5 h-3.5" />
			</button>
		</li>
	);
}

function MemberForm({
	member,
	onClose,
}: {
	member?: VetTeamMember;
	onClose: () => void;
}) {
	const add = useAddVetTeamMember();
	const update = useUpdateVetTeamMember();
	const remove = useRemoveVetTeamMember();
	const [name, setName] = useState(member?.name ?? "");
	const [role, setRole] = useState(member?.role ?? "");
	const [clinic, setClinic] = useState(member?.clinic ?? "");
	const [phone, setPhone] = useState(member?.phone ?? "");
	const [email, setEmail] = useState(member?.email ?? "");
	const [notes, setNotes] = useState(member?.notes ?? "");
	const pending = add.isPending || update.isPending || remove.isPending;

	const submit = async () => {
		if (!name.trim()) {
			toast.error("Nome é obrigatório");
			return;
		}
		try {
			if (member) {
				await update.mutateAsync({
					id: member.id,
					name: name.trim(),
					role: role.trim() || null,
					clinic: clinic.trim() || null,
					phone: phone.trim() || null,
					email: email.trim() || null,
					notes: notes.trim() || null,
				});
			} else {
				await add.mutateAsync({
					name: name.trim(),
					role: role.trim() || undefined,
					clinic: clinic.trim() || undefined,
					phone: phone.trim() || undefined,
					email: email.trim() || undefined,
					notes: notes.trim() || undefined,
				});
			}
			toast.success(member ? "Atualizado" : "Adicionado à equipe");
			onClose();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const doRemove = async () => {
		if (!member) return;
		try {
			await remove.mutateAsync(member.id);
			toast.success("Removido");
			onClose();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<div className="rounded-xl border bg-secondary/40 p-3 space-y-2 mb-3">
			<Input
				placeholder="Nome *"
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
				<Input
					placeholder="Especialidade / função"
					value={role}
					onChange={(e) => setRole(e.target.value)}
				/>
				<Input
					placeholder="Clínica"
					value={clinic}
					onChange={(e) => setClinic(e.target.value)}
				/>
				<Input
					placeholder="Telefone"
					value={phone}
					onChange={(e) => setPhone(e.target.value)}
				/>
				<Input
					placeholder="E-mail"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<Textarea
				placeholder="Observações (o que acompanha, etc.)"
				rows={2}
				value={notes}
				onChange={(e) => setNotes(e.target.value)}
			/>
			<div className="flex items-center gap-2">
				<Button size="sm" onClick={submit} disabled={pending}>
					{pending ? "Salvando…" : member ? "Salvar" : "Adicionar"}
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={onClose}
					disabled={pending}
				>
					Cancelar
				</Button>
				{member ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={doRemove}
						disabled={pending}
						className="ml-auto text-destructive hover:text-destructive"
					>
						Remover
					</Button>
				) : null}
			</div>
		</div>
	);
}
