import { Link, useParams } from "@tanstack/react-router";
import { EpisodeView } from "../components/EpisodeView.tsx";
import { Layout } from "../components/Layout.tsx";
import { useEpisode } from "../lib/queries.ts";

export function EpisodePage() {
	const { episodeId } = useParams({ from: "/episode/$episodeId" });
	const { data } = useEpisode(episodeId);
	const ep = data?.episode;

	return (
		<Layout
			breadcrumb={
				<span className="flex items-center gap-2">
					<Link to="/" className="hover:underline">
						pet
					</Link>
					<span>/</span>
					<span>{ep?.title ?? "episode"}</span>
				</span>
			}
		>
			<div className="max-w-4xl mx-auto p-4">
				<EpisodeView episodeId={episodeId} />
			</div>
		</Layout>
	);
}
